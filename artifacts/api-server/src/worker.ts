import { Worker, type Job } from "bullmq";
import { pool } from "@workspace/db";
import { closeOutboxQueue, type EmailDispatchJob } from "./lib/outbox.js";
import { createRedisConnection, loadQueueConfig, QUEUE_NAMES } from "./lib/queue-config.js";
import { processEmailDispatchJob } from "./worker-processor.js";
import { sanitizeQueueError } from "./lib/outbox.js";
import { logger } from "./lib/logger.js";
import { createActiveJobTracker, gracefulShutdownWorker } from "./worker-shutdown.js";

const config = loadQueueConfig();
const connection = createRedisConnection(config);
export const activeJobTracker = createActiveJobTracker();
export const worker = new Worker<EmailDispatchJob>(
  QUEUE_NAMES.emailScheduled,
  (job: Job<EmailDispatchJob>) => activeJobTracker.track((signal) => processEmailDispatchJob(job, config, { signal })),
  {
    connection,
    prefix: config.prefix,
    concurrency: config.concurrency,
    autorun: true,
  },
);

worker.on("error", (error) => logger.error({ error: sanitizeQueueError(error), queue: QUEUE_NAMES.emailScheduled, status: "failed" }, "Worker error"));
let shuttingDown = false;

async function closeResources(): Promise<void> {
  await connection.quit();
  await closeOutboxQueue();
  await pool.end();
}

export async function shutdownWorker(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, queue: QUEUE_NAMES.emailScheduled, status: "stopping", timeoutMs: config.shutdownTimeoutMs }, "Worker graceful shutdown started");
  const result = await gracefulShutdownWorker({
    pauseNewJobs: () => worker.pause(true),
    waitForActiveJobs: (timeoutMs) => activeJobTracker.waitForDrain(timeoutMs),
    abortActiveJobs: () => activeJobTracker.abortAll(new Error("Worker shutdown deadline reached")),
    closeGracefully: () => worker.close(false),
    closeForcefully: () => worker.close(true),
    closeRedis: () => connection.quit().then(() => undefined),
    closeOutbox: () => closeOutboxQueue(),
    closeDatabase: () => pool.end(),
    activeJobsRemaining: () => activeJobTracker.activeCount,
  }, config.shutdownTimeoutMs);

  if (!result.resourcesClosed && activeJobTracker.activeCount > 0) {
    void activeJobTracker.waitForDrain(config.shutdownTimeoutMs * 2).then(async (drained) => {
      if (!drained || activeJobTracker.activeCount > 0) {
        logger.error({ signal, activeJobs: activeJobTracker.activeCount, status: "resources_left_open" }, "Worker processors did not drain after force close");
        return;
      }
      try {
        await closeResources();
      } catch (error) {
        logger.error({ signal, error: sanitizeQueueError(error), status: "resource_close_failed" }, "Deferred Worker resource close failed");
      }
    }).catch((error) => logger.error({ signal, error: sanitizeQueueError(error), status: "drain_wait_failed" }, "Deferred Worker drain wait failed"));
  }
  logger.info({ signal, queue: QUEUE_NAMES.emailScheduled, mode: result.mode, status: result.resourcesClosed ? "stopped" : "forced_waiting", errors: result.errors.length }, "Worker graceful shutdown finished");
}

process.once("SIGTERM", () => void shutdownWorker("SIGTERM"));
process.once("SIGINT", () => void shutdownWorker("SIGINT"));
logger.info({ queue: QUEUE_NAMES.emailScheduled, concurrency: config.concurrency, status: "ready" }, "Worker started");
