import { and, eq } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSchedulerCycle } from "../scheduler-core.js";
import { closeOutboxQueue } from "./outbox.js";

const userId = crypto.randomUUID();
const emailId = crypto.randomUUID();
const emailAddress = `scheduler-${Date.now()}@test.invalid`;

describe("Scheduler PostgreSQL concurrency", () => {
  beforeAll(async () => {
    process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    await db.insert(usersTable).values({ id: userId, email: emailAddress, passwordHash: "test-hash", firstName: "Scheduler", lastName: "Test" });
    await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: emailAddress, subject: "Scheduler fixture", status: "scheduled", scheduledAt: new Date(Date.now() - 1000) });
    await db.insert(emailDispatchOutboxTable).values({ emailId, jobKey: `email:${emailId}`, queueName: "email-scheduled", availableAt: new Date(Date.now() - 1000), maxAttempts: 2 });
  });

  it("allows only one concurrent scheduler cycle to reserve the logical Outbox job", async () => {
    const [first, second] = await Promise.all([runSchedulerCycle(), runSchedulerCycle()]);
    expect(first.published + second.published).toBeLessThanOrEqual(1);
    const [row] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.emailId, emailId));
    expect(row?.status).toBe("publishing");
  });

  afterAll(async () => {
    await db.delete(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.emailId, emailId));
    await db.delete(emailsTable).where(eq(emailsTable.id, emailId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await closeOutboxQueue();
  });
});
