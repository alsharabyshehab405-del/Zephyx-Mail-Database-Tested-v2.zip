import { pool } from "@workspace/db";
import { closeOutboxQueue } from "./lib/outbox.js";
import { loadQueueConfig } from "./lib/queue-config.js";
import { runSchedulerCycle } from "./scheduler-core.js";
import { logger } from "./lib/logger.js";
import { unlinkSync, writeFileSync } from "node:fs";

const config = loadQueueConfig();
if (!config.schedulerEnabled) throw new Error("SCHEDULER_ENABLED must be true for the scheduler process");
const intervalMs = 1000;
let stopping = false;
let timer: NodeJS.Timeout | null = null;
const readinessMarker = "/tmp/zephyx-scheduler-ready";
function clearReadinessMarker(): void {
  try { unlinkSync(readinessMarker); } catch {}
}

function sanitizedError(error: unknown): { message: string } {
  const message = error instanceof Error ? error.message : "Scheduler operation failed";
  return { message: message.replace(/redis:\/\/[^\s]+/gi, "redis://[redacted]").replace(/(password|token|secret|authorization)=?[^\s,;]+/gi, "$1=[redacted]").slice(0, 300) };
}

async function scheduleNextCycle(): Promise<void> {
  if (stopping) return;
  try {
    const result = await runSchedulerCycle();
    logger.info({ queue: "email-scheduled", published: result.published, locked: result.locked, status: "completed" }, "Scheduler cycle completed");
  } catch (error) {
    logger.error({ error: sanitizedError(error), queue: "email-scheduled", status: "failed" }, "Scheduler cycle failed");
  }
  if (!stopping) {
    timer = setTimeout(() => void scheduleNextCycle(), intervalMs);
    timer.unref();
  }
}

export async function shutdownScheduler(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearReadinessMarker();
  if (timer) clearTimeout(timer);
  logger.info({ signal, status: "stopping" }, "Scheduler graceful shutdown started");
  await closeOutboxQueue();
  await pool.end();
}

process.once("SIGTERM", () => void shutdownScheduler("SIGTERM"));
process.once("SIGINT", () => void shutdownScheduler("SIGINT"));
void scheduleNextCycle();
writeFileSync(readinessMarker, `${process.pid}\n`, { mode: 0o600 });
logger.info({ intervalMs, status: "ready" }, "Scheduler started");
