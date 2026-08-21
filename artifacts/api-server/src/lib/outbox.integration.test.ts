import { eq, inArray } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimOutboxJob, completeOutboxJob, failOutboxJob, insertEmailDispatchOutbox } from "./outbox.js";
import { queueMaxAttempts } from "./queue-config.js";

const userId = crypto.randomUUID();
const emailId = crypto.randomUUID();
const outboxId = crypto.randomUUID();
const address = `outbox-${Date.now()}@test.invalid`;
const fixtureIds: string[] = [outboxId];

describe("PostgreSQL outbox concurrency and retry ownership", () => {
  beforeAll(async () => {
    await db.insert(usersTable).values({ id: userId, email: address, passwordHash: "test-hash", firstName: "Outbox", lastName: "Test" });
    await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: address, subject: "Outbox fixture", status: "scheduled", scheduledAt: new Date(Date.now() - 1000) });
  });

  it("allows exactly one worker to claim a durable outbox row", async () => {
    await db.insert(emailDispatchOutboxTable).values({ id: outboxId, emailId, jobKey: `email:${emailId}`, queueName: "email-scheduled", availableAt: new Date(), maxAttempts: 2 });
    const [first, second] = await Promise.all([claimOutboxJob(outboxId, 30_000), claimOutboxJob(outboxId, 30_000)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await completeOutboxJob(outboxId);
  });

  it("reclaims a processing job after its lease expires", async () => {
    const leaseId = crypto.randomUUID();
    fixtureIds.push(leaseId);
    await db.insert(emailDispatchOutboxTable).values({ id: leaseId, emailId, jobKey: `email:${emailId}-lease`, queueName: "email-scheduled", status: "processing", attempts: 1, leaseExpiresAt: new Date(Date.now() - 1000), availableAt: new Date(Date.now() - 1000), maxAttempts: 3 });
    const recovered = await claimOutboxJob(leaseId, 30_000);
    expect(recovered?.status).toBe("processing");
  });

  it("stores the configured maxAttempts on a newly created Outbox row", async () => {
    const configured = "7";
    const previous = process.env.QUEUE_MAX_ATTEMPTS;
    process.env.QUEUE_MAX_ATTEMPTS = configured;
    const createdId = crypto.randomUUID();
    fixtureIds.push(createdId);
    const createdEmailId = crypto.randomUUID();
    await db.insert(emailsTable).values({ id: createdEmailId, userId, fromEmail: address, subject: "max attempts", status: "scheduled", scheduledAt: new Date(Date.now() - 1000) });
    const created = await insertEmailDispatchOutbox(db, { emailId: createdEmailId, availableAt: new Date(Date.now() - 1000), correlationId: "max-attempts-test" });
    fixtureIds.push(String(created.id));
    expect(created.maxAttempts).toBe(7);
    if (previous === undefined) delete process.env.QUEUE_MAX_ATTEMPTS;
    else process.env.QUEUE_MAX_ATTEMPTS = previous;
  });

  it("sets nextAttemptAt for temporary failure and dead_letters at the row threshold", async () => {
    const retryId = crypto.randomUUID();
    fixtureIds.push(retryId);
    await db.insert(emailDispatchOutboxTable).values({ id: retryId, emailId, jobKey: `email:${emailId}-retry`, queueName: "email-scheduled", availableAt: new Date(Date.now() - 1000), maxAttempts: 2 });
    const claimed = await claimOutboxJob(retryId, 30_000);
    expect(claimed?.attempts).toBe(1);
    expect(await failOutboxJob(claimed!, new Error("temporary"), 100)).toBe("failed");
    const [failed] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, retryId));
    expect(failed?.nextAttemptAt).not.toBeNull();
    await db.update(emailDispatchOutboxTable).set({ nextAttemptAt: new Date(Date.now() - 1) }).where(eq(emailDispatchOutboxTable.id, retryId));
    const retryClaim = await claimOutboxJob(retryId, 30_000);
    expect(retryClaim?.attempts).toBe(2);
    expect(await failOutboxJob(retryClaim!, new Error("permanent after threshold"), 100)).toBe("dead_letter");
    const [dead] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, retryId));
    expect(dead?.status).toBe("dead_letter");
  });

  it("uses the queue setting helper for a bounded maxAttempts value", () => {
    expect(queueMaxAttempts({ QUEUE_MAX_ATTEMPTS: "9" })).toBe(9);
  });

  afterAll(async () => {
    await db.delete(emailDispatchOutboxTable).where(inArray(emailDispatchOutboxTable.id, fixtureIds));
    await db.delete(emailsTable).where(eq(emailsTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
