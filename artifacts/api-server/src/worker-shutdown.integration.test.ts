import { Queue, Worker, type Job } from "bullmq";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import IORedis from "ioredis";
import { and, eq } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, describe, expect, it } from "vitest";
import { completeOutboxJob, closeOutboxQueue, type EmailDispatchJob } from "./lib/outbox.js";
import { runSchedulerCycle } from "./scheduler-core.js";
import { createActiveJobTracker, gracefulShutdownWorker } from "./worker-shutdown.js";
import { processEmailDispatchJob } from "./worker-processor.js";
import type { QueueRuntimeConfig } from "./lib/queue-config.js";

const redisUrl = process.env.REDIS_URL;
const queueName = "email-scheduled";
const config: QueueRuntimeConfig = {
  redisUrl: redisUrl ?? "redis://127.0.0.1:6379",
  prefix: `shutdown-real-${Date.now()}`,
  concurrency: 1,
  maxAttempts: 3,
  backoffMs: 10,
  jobTimeoutMs: 1_000,
  smtpTimeouts: { connectionTimeoutMs: 100, greetingTimeoutMs: 100, socketTimeoutMs: 200 },
  leaseMs: 2_000,
  shutdownTimeoutMs: 1_000,
  hardShutdownTimeoutMs: 2_000,
  workerLockDurationMs: 2_000,
  schedulerEnabled: false,
};

const fixtureIds: { userId: string; emailId: string; outboxId: string }[] = [];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const execFileAsync = promisify(execFile);

type ChildWithOutput = ChildProcessByStdio<null, Readable, Readable>;

async function waitForChildText(child: ChildWithOutput, text: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Child did not emit ${text}; output=${output.slice(-500)}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(text)) { clearTimeout(timer); child.stdout.off("data", onData); child.stderr.off("data", onData); resolve(); }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Child Worker did not exit before hard deadline")), timeoutMs);
    child.once("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function fixture(label: string) {
  const userId = crypto.randomUUID();
  const emailId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const address = `shutdown-${label}-${Date.now()}@test.invalid`;
  await db.insert(usersTable).values({ id: userId, email: address, passwordHash: "test-hash", firstName: "Shutdown", lastName: "Test" });
  await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: address, subject: label, status: "scheduled", scheduledAt: new Date(Date.now() - 1000) });
  await db.insert(emailDispatchOutboxTable).values({ id: outboxId, emailId, jobKey: `email:${emailId}`, queueName, availableAt: new Date(Date.now() - 1000), maxAttempts: 3 });
  fixtureIds.push({ userId, emailId, outboxId });
  return { userId, emailId, outboxId };
}

type Harness = {
  queue: Queue;
  worker: Worker;
  producer: IORedis;
  workerConnection: IORedis;
  tracker: ReturnType<typeof createActiveJobTracker>;
  order: string[];
  shutdown: () => Promise<Awaited<ReturnType<typeof gracefulShutdownWorker>>>;
};

async function harness(processor: (job: Job, signal: AbortSignal) => Promise<void>): Promise<Harness> {
  if (!redisUrl) throw new Error("REDIS_URL is required for BullMQ shutdown integration tests");
  const producer = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(queueName, { connection: producer, prefix: config.prefix, defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: false } });
  const tracker = createActiveJobTracker();
  const order: string[] = [];
  const worker = new Worker(queueName, (job: Job) => tracker.track((signal) => processor(job, signal)), { connection: workerConnection, prefix: config.prefix, concurrency: 1 });
  await worker.waitUntilReady();

  return {
    queue,
    worker,
    producer,
    workerConnection,
    tracker,
    order,
    shutdown: () => gracefulShutdownWorker({
      pauseNewJobs: async () => { order.push("pause"); await worker.pause(true); },
      waitForActiveJobs: (timeoutMs) => tracker.waitForDrain(timeoutMs),
      abortActiveJobs: async () => { order.push("abort"); tracker.abortAll(new Error("shutdown deadline")); },
      closeGracefully: async () => { order.push("close-graceful"); await worker.close(false); },
      closeForcefully: async () => { order.push("close-force"); await worker.close(true); },
      closeRedis: async () => { order.push("redis"); await queue.close(); await workerConnection.quit(); },
      closeOutbox: async () => { order.push("outbox"); },
      closeDatabase: async () => { order.push("database"); },
      activeJobsRemaining: () => tracker.activeCount,
    }, config.shutdownTimeoutMs),
  };
}

async function cleanupRedis(h: Harness): Promise<void> {
  await h.queue.close().catch(() => undefined);
  await h.producer.quit().catch(() => undefined);
  await h.workerConnection.quit().catch(() => undefined);
}

describe("real BullMQ Worker graceful shutdown", () => {
  it("drains a fast Job, calls graceful close, completes Outbox, and closes resources", async () => {
    const item = await fixture("fast");
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const h = await harness(async (job) => {
      started();
      await wait(20);
      await completeOutboxJob(item.outboxId);
    });
    await db.update(emailDispatchOutboxTable).set({ status: "processing", attempts: 1, leaseExpiresAt: new Date(Date.now() + 2000) }).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    await h.queue.add("email-send", { outboxId: item.outboxId, emailId: item.emailId }, { jobId: `fast-${item.outboxId}` });
    await startedPromise;
    const resultPromise = h.shutdown();
    const result = await resultPromise;
    const [outbox] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    expect(result).toMatchObject({ timedOut: false, mode: "graceful", workerClosed: true, resourcesClosed: true });
    expect(h.order.slice(0, 3)).toEqual(["pause", "close-graceful", "redis"]);
    expect(h.order).not.toContain("close-force");
    expect(outbox?.status).toBe("completed");
    await cleanupRedis(h);
  });

  it("force-closes a hanging Job first, leaves resources open, and recovers Outbox after Lease expiry", async () => {
    const item = await fixture("hanging");
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const hanging = new Promise<void>((resolve) => { release = resolve; });
    const h = await harness(async () => { started(); await hanging; });
    await db.update(emailDispatchOutboxTable).set({ status: "processing", attempts: 1, leaseExpiresAt: new Date(Date.now() + 1000) }).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    await h.queue.add("email-send", { outboxId: item.outboxId, emailId: item.emailId }, { jobId: `hanging-${item.outboxId}` });
    await startedPromise;
    const result = await h.shutdown();
    const [beforeRecovery] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    expect(result).toMatchObject({ timedOut: true, mode: "force", workerClosed: true, resourcesClosed: false });
    expect(h.order.slice(0, 3)).toEqual(["pause", "abort", "close-force"]);
    expect(h.order).not.toContain("close-graceful");
    expect(h.order).not.toContain("redis");
    expect(beforeRecovery?.status).toBe("processing");
    expect(beforeRecovery?.leaseExpiresAt).not.toBeNull();

    release();
    expect(await h.tracker.waitForDrain(1_000)).toBe(true);
    await cleanupRedis(h);
    await db.update(emailDispatchOutboxTable).set({ status: "processing", leaseExpiresAt: new Date(Date.now() - 1), nextAttemptAt: null }).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    const recoveryConfig = { ...config, prefix: `${config.prefix}-recovery` };
    const recovered = await processEmailDispatchJob({ id: `recovery-${item.outboxId}`, attemptsMade: 0, data: { outboxId: item.outboxId, emailId: item.emailId, correlationId: "recovery", jobKey: `email:${item.emailId}` } }, recoveryConfig, {
      dispatch: async (email) => {
        const [sent] = await db.update(emailsTable).set({ status: "sent", folder: "sent", sentAt: new Date(), scheduledAt: null, sendError: null }).where(and(eq(emailsTable.id, email.id), eq(emailsTable.status, "sending"))).returning();
        return sent!;
      },
    });
    const [afterRecovery] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    expect(recovered).toBe("completed");
    expect(afterRecovery?.status).toBe("completed");
  });

  it("hard-exits a real hanging Worker child and lets a new Worker recover the Outbox after Lease expiry", async () => {
    const item = await fixture("child-hard-shutdown");
    const prefix = `child-hard-${Date.now()}`;
    const childConfig = { ...config, prefix, leaseMs: 1_500, shutdownTimeoutMs: 1_000, hardShutdownTimeoutMs: 2_500, workerLockDurationMs: 1_000 };
    await db.update(emailDispatchOutboxTable).set({ status: "processing", attempts: 1, leaseExpiresAt: new Date(Date.now() + 1_500) }).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    const apiRoot = process.cwd();
    await execFileAsync(process.execPath, [path.join(apiRoot, "build.mjs")], { cwd: apiRoot, env: process.env });
    const child = spawn(process.execPath, [path.join(apiRoot, "dist/worker.mjs")], {
      cwd: apiRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        REDIS_URL: redisUrl!,
        QUEUE_PREFIX: prefix,
        WORKER_TEST_HANG_PROCESSOR: "true",
        JOB_TIMEOUT_MS: "1000",
        SMTP_CONNECTION_TIMEOUT_MS: "100",
        SMTP_GREETING_TIMEOUT_MS: "100",
        SMTP_SOCKET_TIMEOUT_MS: "200",
        WORKER_SHUTDOWN_TIMEOUT_MS: "1000",
        WORKER_HARD_SHUTDOWN_TIMEOUT_MS: "2500",
        WORKER_LOCK_DURATION_MS: "1000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const queue = new Queue(queueName, { connection: new IORedis(redisUrl!, { maxRetriesPerRequest: null }), prefix, defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: false } });
    try {
      await waitForChildText(child, "Worker started", 10_000);
      await queue.add("email-send", { outboxId: item.outboxId, emailId: item.emailId }, { jobId: `child-hard-${item.outboxId}` });
      await wait(100);
      child.kill("SIGTERM");
      const exit = await waitForChildExit(child, 5_000);
      expect(exit.code).not.toBe(0);
      const [beforeRecovery] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
      expect(beforeRecovery?.status).toBe("processing");
      expect(beforeRecovery?.leaseExpiresAt).not.toBeNull();

      await wait(1_600);
      await closeOutboxQueue();
      const recoveryWorkerConnection = new IORedis(redisUrl!, { maxRetriesPerRequest: null });
      const recoveryQueueConnection = new IORedis(redisUrl!, { maxRetriesPerRequest: null });
      let sends = 0;
      const recoveryWorker = new Worker(queueName, (job: Job<EmailDispatchJob>) => processEmailDispatchJob(job, childConfig, {
        dispatch: async (email) => {
          sends += 1;
          const [sent] = await db.update(emailsTable).set({ status: "sent", folder: "sent", sentAt: new Date(), scheduledAt: null, sendError: null }).where(and(eq(emailsTable.id, email.id), eq(emailsTable.status, "sending"))).returning();
          return sent!;
        },
      }), { connection: recoveryWorkerConnection, prefix, concurrency: 1, lockDuration: childConfig.workerLockDurationMs, stalledInterval: 200 });
      const recoveryQueue = new Queue(queueName, { connection: recoveryQueueConnection, prefix });
      try {
        await recoveryWorker.waitUntilReady();
        await runSchedulerCycle(childConfig);
        for (let i = 0; i < 50; i += 1) {
          const [row] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
          if (row?.status === "completed") break;
          await wait(100);
        }
        const [afterRecovery] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
        expect(afterRecovery?.status).toBe("completed");
        expect(sends).toBe(1);
      } finally {
        await recoveryWorker.close();
        await recoveryQueue.close();
        await recoveryWorkerConnection.quit();
        await recoveryQueueConnection.quit();
      }
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await queue.close().catch(() => undefined);
    }
  });

  it("pauses intake so a second Job remains waiting for another Worker", async () => {
    const first = await fixture("intake-first");
    const second = await fixture("intake-second");
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const blocking = new Promise<void>((resolve) => { release = resolve; });
    let processed = 0;
    const h = await harness(async (job) => {
      processed += 1;
      if (job.data.outboxId === first.outboxId) { started(); await blocking; await completeOutboxJob(first.outboxId); }
    });
    await db.update(emailDispatchOutboxTable).set({ status: "processing", attempts: 1, leaseExpiresAt: new Date(Date.now() + 2000) }).where(eq(emailDispatchOutboxTable.id, first.outboxId));
    await h.queue.add("email-send", { outboxId: first.outboxId, emailId: first.emailId }, { jobId: `intake-first-${first.outboxId}` });
    await startedPromise;
    const shutdownPromise = h.shutdown();
    for (let i = 0; i < 50 && !h.order.includes("pause"); i += 1) await wait(5);
    expect(h.order).toContain("pause");
    const secondJob = await h.queue.add("email-send", { outboxId: second.outboxId, emailId: second.emailId }, { jobId: `intake-second-${second.outboxId}` });
    release();
    const result = await shutdownPromise;
    expect(result.mode).toBe("graceful");
    expect(processed).toBe(1);
    const inspectConnection = new IORedis(redisUrl!, { maxRetriesPerRequest: null });
    const inspectQueue = new Queue(queueName, { connection: inspectConnection, prefix: config.prefix });
    try {
      const waiting = await inspectQueue.getJob(secondJob.id!);
      expect(waiting).not.toBeNull();
      expect(await waiting!.getState()).toBe("waiting");
    } finally {
      await inspectQueue.close();
      await inspectConnection.quit();
    }
    await cleanupRedis(h);
  });

  afterAll(async () => {
    for (const item of fixtureIds) {
      await db.delete(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
      await db.delete(emailsTable).where(eq(emailsTable.id, item.emailId));
      await db.delete(usersTable).where(eq(usersTable.id, item.userId));
    }
  });
});
