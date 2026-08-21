import { Worker, type Job } from "bullmq";
import { pool } from "@workspace/db";
import { closeOutboxQueue, type EmailDispatchJob } from "./lib/outbox.js";
import { createRedisConnection, loadQueueConfig, QUEUE_NAMES } from "./lib/queue-config.js";
import { processEmailDispatchJob } from "./worker-processor.js";
import { sanitizeQueueError } from "./lib/outbox.js";
import { logger } from "./lib/logger.js";

const config = loadQueueConfig();
const connection = createRedisConnection(config);
export const worker = new Worker<EmailDispatchJob>(QUEUE_NAMES.emailScheduled, (job: Job<EmailDispatchJob>) => processEmailDispatchJob(job, config), {
  connection,
  prefix: config.prefix,
  concurrency: config.concurrency,
  autorun: true,
});

worker.on("error", (error) => logger.error({ error: sanitizeQueueError(error), queue: QUEUE_NAMES.emailScheduled, status: "failed" }, "Worker error"));
let shuttingDown = false;

export async function shutdownWorker(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, queue: QUEUE_NAMES.emailScheduled, status: "stopping" }, "Worker graceful shutdown started");
  await worker.close();
  await connection.quit();
  await closeOutboxQueue();
  await pool.end();
}

process.once("SIGTERM", () => void shutdownWorker("SIGTERM"));
process.once("SIGINT", () => void shutdownWorker("SIGINT"));
logger.info({ queue: QUEUE_NAMES.emailScheduled, concurrency: config.concurrency, status: "ready" }, "Worker started");
