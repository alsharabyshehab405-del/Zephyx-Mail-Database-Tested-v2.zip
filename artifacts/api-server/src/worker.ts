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
const testHangingProcessor = process.env.NODE_ENV !== "production" && process.env.WORKER_TEST_HANG_PROCESSOR === "true";

export const worker = new Worker<EmailDispatchJob>(
  QUEUE_NAMES.emailScheduled,
  (job: Job<EmailDispatchJob>) => activeJobTracker.track((signal) => {
    if (testHangingProcessor) return new Promise<never>(() => undefined);
    return processEmailDispatchJob(job, config, { signal });
  }),
  {
    connection,
    prefix: config.prefix,
    concurrency: config.concurrency,
    lockDuration: config.workerLockDurationMs,
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
  let hardDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const hardDeadline = new Promise<never>((_, reject) => {
    hardDeadlineTimer = setTimeout(() => {
      logger.error({ signal, status: "hard_shutdown_timeout" }, "Worker hard shutdown deadline exceeded; terminating Worker process");
      process.exitCode = 1;
      process.exit(1);
      reject(new Error("Worker hard shutdown deadline exceeded"));
    }, config.hardShutdownTimeoutMs);
  });
  hardDeadlineTimer?.unref?.();

  const shutdown = async (): Promise<void> => {
    logger.info({ signal, queue: QUEUE_NAMES.emailScheduled, status: "stopping", timeoutMs: config.shutdownTimeoutMs, hardTimeoutMs: config.hardShutdownTimeoutMs }, "Worker graceful shutdown started");
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

    if (result.resourcesClosed && activeJobTracker.activeCount === 0) {
      if (hardDeadlineTimer) clearTimeout(hardDeadlineTimer);
      logger.info({ signal, queue: QUEUE_NAMES.emailScheduled, mode: result.mode, status: "stopped", errors: result.errors.length }, "Worker graceful shutdown finished");
      return;
    }

    logger.error({ signal, mode: result.mode, activeJobs: activeJobTracker.activeCount, resourcesClosed: result.resourcesClosed, status: "waiting_for_hard_deadline" }, "Worker shutdown incomplete; Outbox leases remain responsible for recovery");
    if (activeJobTracker.activeCount > 0) {
      void activeJobTracker.waitForDrain(config.hardShutdownTimeoutMs).then(async (drained) => {
        if (!drained || activeJobTracker.activeCount > 0) return;
        try {
          await closeResources();
          if (hardDeadlineTimer) clearTimeout(hardDeadlineTimer);
        } catch (error) {
          logger.error({ signal, error: sanitizeQueueError(error), status: "deferred_resource_close_failed" }, "Deferred Worker resource close failed");
        }
      }).catch((error) => logger.error({ signal, error: sanitizeQueueError(error), status: "deferred_drain_failed" }, "Deferred Worker drain wait failed"));
    }
  };

  await Promise.race([shutdown(), hardDeadline]);
}

process.once("SIGTERM", () => void shutdownWorker("SIGTERM"));
process.once("SIGINT", () => void shutdownWorker("SIGINT"));
logger.info({ queue: QUEUE_NAMES.emailScheduled, concurrency: config.concurrency, status: "ready" }, "Worker started");
