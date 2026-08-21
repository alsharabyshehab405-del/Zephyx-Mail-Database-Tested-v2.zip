import { Worker, type Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { db, emailsTable, pool } from "@workspace/db";
import { dispatchClaimedEmail } from "./modules/emails/emails.service.js";
import { closeOutboxQueue, claimOutboxJob, completeOutboxJob, failOutboxJob, type EmailDispatchJob } from "./lib/outbox.js";
import { createRedisConnection, loadQueueConfig, QUEUE_NAMES } from "./lib/queue-config.js";
import { logger } from "./lib/logger.js";

const config = loadQueueConfig();
const connection = createRedisConnection(config);
const worker = new Worker<EmailDispatchJob>(QUEUE_NAMES.emailScheduled, async (job: Job<EmailDispatchJob>) => {
  const startedAt = Date.now();
  const outbox = await claimOutboxJob(job.data.outboxId, config.jobTimeoutMs);
  if (!outbox) return;
  try {
    const [email] = await db.update(emailsTable).set({ status: "sending", sendError: null }).where(and(
      eq(emailsTable.id, outbox.emailId),
      inArray(emailsTable.status, ["pending_send", "scheduled", "sending", "failed"]),
    )).returning();
    if (!email) {
      await completeOutboxJob(outbox.id);
      return;
    }
    await Promise.race([
      dispatchClaimedEmail(email),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Job timeout")), config.jobTimeoutMs)),
    ]);
    const durationMs = Date.now() - startedAt;
    await completeOutboxJob(outbox.id, durationMs);
    logger.info({ jobId: job.id, queue: QUEUE_NAMES.emailScheduled, attempt: job.attemptsMade + 1, durationMs, status: "completed" }, "Queue job completed");
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const retryable = !statusCode || statusCode === 408 || statusCode === 429 || statusCode >= 500 || /timeout|temporar|econn|rate limit/i.test(error instanceof Error ? error.message : "");
    const result = await failOutboxJob(outbox, error, config.backoffMs, !retryable);
    logger.error({ jobId: job.id, queue: QUEUE_NAMES.emailScheduled, attempt: job.attemptsMade + 1, durationMs: Date.now() - startedAt, status: result }, "Queue job failed");
    if (retryable) throw error;
  }
}, { connection, prefix: config.prefix, concurrency: config.concurrency });

worker.on("error", (error) => logger.error({ err: error, queue: QUEUE_NAMES.emailScheduled }, "Worker error"));
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, queue: QUEUE_NAMES.emailScheduled }, "Worker graceful shutdown started");
  const timer = setTimeout(() => process.exit(1), 10_000); timer.unref();
  await worker.close();
  await connection.quit();
  await closeOutboxQueue();
  await pool.end();
  clearTimeout(timer);
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
logger.info({ queue: QUEUE_NAMES.emailScheduled, concurrency: config.concurrency, status: "ready" }, "Worker started");
