import { and, eq } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, describe, expect, it } from "vitest";
import { claimOutboxJob, completeOutboxJob } from "./outbox.js";

const userId = crypto.randomUUID();
const emailId = crypto.randomUUID();
const outboxId = crypto.randomUUID();
const address = `outbox-${Date.now()}@test.invalid`;

describe("PostgreSQL outbox concurrency", () => {
  it("allows exactly one worker to claim a durable outbox row", async () => {
    await db.insert(usersTable).values({ id: userId, email: address, passwordHash: "test-hash", firstName: "Outbox", lastName: "Test" });
    await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: address, subject: "Outbox fixture" });
    await db.insert(emailDispatchOutboxTable).values({ id: outboxId, emailId, jobKey: `email:${emailId}`, queueName: "email-scheduled", availableAt: new Date() });
    const [first, second] = await Promise.all([claimOutboxJob(outboxId, 30_000), claimOutboxJob(outboxId, 30_000)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await completeOutboxJob(outboxId);
  });

  it("reclaims a processing job after its lease expires", async () => {
    const leaseId = crypto.randomUUID();
    await db.insert(emailDispatchOutboxTable).values({ id: leaseId, emailId, jobKey: `email:${emailId}:lease`, queueName: "email-scheduled", status: "processing", attempts: 1, leaseExpiresAt: new Date(Date.now() - 1000), availableAt: new Date(Date.now() - 1000) });
    const recovered = await claimOutboxJob(leaseId, 30_000);
    expect(recovered?.status).toBe("processing");
    await db.delete(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, leaseId));
  });

  afterAll(async () => {
    await db.delete(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.emailId, emailId));
    await db.delete(emailsTable).where(eq(emailsTable.id, emailId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
