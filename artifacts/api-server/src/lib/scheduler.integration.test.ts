import { eq } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSchedulerCycle } from "../scheduler-core.js";
import { closeOutboxQueue, dispatchJobId } from "./outbox.js";
import { createQueue, loadQueueConfig, QUEUE_NAMES } from "./queue-config.js";

const userId = crypto.randomUUID();
const emailId = crypto.randomUUID();
const emailAddress = `scheduler-${Date.now()}@test.invalid`;

const config = loadQueueConfig({
  ...process.env,
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  JOB_TIMEOUT_MS: "1000",
  SMTP_CONNECTION_TIMEOUT_MS: "100",
  SMTP_GREETING_TIMEOUT_MS: "100",
  SMTP_SOCKET_TIMEOUT_MS: "200",
  WORKER_SHUTDOWN_TIMEOUT_MS: "1000",
  WORKER_HARD_SHUTDOWN_TIMEOUT_MS: "2000",
  WORKER_LOCK_DURATION_MS: "2000",
});

describe("Scheduler PostgreSQL concurrency", () => {
  beforeAll(async () => {
    process.env.REDIS_URL = config.redisUrl;
    await db.insert(usersTable).values({ id: userId, email: emailAddress, passwordHash: "test-hash", firstName: "Scheduler", lastName: "Test" });
    await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: emailAddress, subject: "Scheduler fixture", status: "scheduled", scheduledAt: new Date(Date.now() - 1000) });
    await db.insert(emailDispatchOutboxTable).values({ emailId, jobKey: `email:${emailId}`, queueName: QUEUE_NAMES.emailScheduled, availableAt: new Date(Date.now() - 1000), maxAttempts: 2 });
  });

  it("allows one locked cycle to reserve one row and creates one logical Redis job", async () => {
    const [first, second] = await Promise.all([runSchedulerCycle(config), runSchedulerCycle(config)]);
    expect([first, second].some((cycle) => cycle.locked && cycle.reserved === 1)).toBe(true);
    expect(first.reserved + second.reserved).toBe(1);
    expect([first, second].some((cycle) => cycle.locked === false || cycle.reserved === 0)).toBe(true);

    const [row] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.emailId, emailId));
    expect(row?.status).toBe("publishing");

    const { queue, connection } = createQueue(QUEUE_NAMES.emailScheduled, config);
    try {
      const job = await queue.getJob(dispatchJobId(row!.jobKey));
      expect(job).not.toBeNull();
      const jobs = await queue.getJobs(["waiting", "active", "delayed", "waiting-children", "failed", "completed"]);
      expect(jobs.filter((candidate) => candidate.id === dispatchJobId(row!.jobKey))).toHaveLength(1);
    } finally {
      await queue.close();
      await connection.quit();
    }
  });

  afterAll(async () => {
    await db.delete(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.emailId, emailId));
    await db.delete(emailsTable).where(eq(emailsTable.id, emailId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await closeOutboxQueue();
  });
});
