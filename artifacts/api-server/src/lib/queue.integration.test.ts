import { Queue, QueueEvents, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { eq } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processEmailDispatchJob } from "../worker-processor.js";
import type { QueueRuntimeConfig } from "./queue-config.js";

const redisUrl = process.env.REDIS_URL;
const userId = crypto.randomUUID();
const emailId = crypto.randomUUID();
const outboxId = crypto.randomUUID();
const emailAddress = `redis-worker-${Date.now()}@test.invalid`;
const prefix = `zephyx-real-worker-${Date.now()}`;
const config: QueueRuntimeConfig = { redisUrl: redisUrl ?? "redis://127.0.0.1:6379", prefix, concurrency: 2, maxAttempts: 2, backoffMs: 10, jobTimeoutMs: 1000, schedulerEnabled: false };
let queue: Queue | null = null;
let worker: Worker | null = null;
let producerConnection: IORedis | null = null;
let workerConnection: IORedis | null = null;
let eventsConnection: IORedis | null = null;
let queueEvents: QueueEvents | null = null;

describe("Redis/BullMQ real Worker integration", () => {
  beforeAll(async () => {
    if (!redisUrl) throw new Error("REDIS_URL is required for real Worker integration tests");
    await db.insert(usersTable).values({ id: userId, email: emailAddress, passwordHash: "test-hash", firstName: "Redis", lastName: "Worker" });
    await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: emailAddress, subject: "Real worker fixture", status: "scheduled", scheduledAt: new Date(Date.now() - 1000) });
    await db.insert(emailDispatchOutboxTable).values({ id: outboxId, emailId, jobKey: `email:${emailId}`, queueName: "email-scheduled", availableAt: new Date(Date.now() - 1000), maxAttempts: 2 });
    producerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    eventsConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    queueEvents = new QueueEvents("email-scheduled", { connection: eventsConnection, prefix });
    queue = new Queue("email-scheduled", { connection: producerConnection, prefix, defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: false } });
    let sends = 0;
    worker = new Worker("email-scheduled", async (job: Job) => processEmailDispatchJob(job as never, config, {
      dispatch: async (email) => {
        sends += 1;
        const [sent] = await db.update(emailsTable).set({ status: "sent", folder: "sent", scheduledAt: null, sentAt: new Date(), sendError: null }).where(eq(emailsTable.id, email.id)).returning();
        return sent!;
      },
    }), { connection: workerConnection, prefix, concurrency: 2 });
    await worker.waitUntilReady();
    await queueEvents.waitUntilReady();
    (globalThis as { __realWorkerSends?: () => number }).__realWorkerSends = () => sends;
  });

  it("runs the real processor once, prevents two producers from duplicating it, and allows the deterministic Job ID after completion", async () => {
    const jobId = `email-${emailId}`;
    const data = { outboxId, emailId, correlationId: "http-correlation", jobKey: `email:${emailId}` };
    const first = await queue!.add("email-send", data, { jobId });
    const second = await queue!.add("email-send", data, { jobId });
    expect(first.id).toBe(second.id);
    await first.waitUntilFinished(queueEvents!, 5000);
    expect((globalThis as { __realWorkerSends?: () => number }).__realWorkerSends?.()).toBe(1);
    const [outbox] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, outboxId));
    const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId));
    expect(outbox?.status).toBe("completed");
    expect(email?.status).toBe("sent");

    const restarted = await queue!.add("email-send", data, { jobId });
    await restarted.waitUntilFinished(queueEvents!, 5000);
    expect((globalThis as { __realWorkerSends?: () => number }).__realWorkerSends?.()).toBe(1);
  });

  afterAll(async () => {
    await worker?.close();
    await queueEvents?.close();
    await queue?.obliterate({ force: true }).catch(() => undefined);
    await queue?.close();
    await producerConnection?.quit();
    await workerConnection?.quit();
    await eventsConnection?.quit();
    await db.delete(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, outboxId));
    await db.delete(emailsTable).where(eq(emailsTable.id, emailId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
