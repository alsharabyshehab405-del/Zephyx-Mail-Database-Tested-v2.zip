import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { closeOutboxQueue, publishDueOutboxJobs } from "./lib/outbox.js";
import { loadQueueConfig } from "./lib/queue-config.js";
import { logger } from "./lib/logger.js";

const config = loadQueueConfig();
if (!config.schedulerEnabled) throw new Error("SCHEDULER_ENABLED must be true for the scheduler process");
const intervalMs = 1000;
let timer: NodeJS.Timeout | null = null;
let stopping = false;

async function recoverExpiredLeases(): Promise<void> {
  await db.execute(sql`
    UPDATE email_dispatch_outbox
    SET status = CASE WHEN attempts >= max_attempts THEN 'dead_letter'::dispatch_status ELSE 'failed'::dispatch_status END,
        lease_expires_at = NULL,
        next_attempt_at = CASE WHEN attempts >= max_attempts THEN NULL ELSE now() END,
        updated_at = now()
    WHERE status = 'processing'::dispatch_status
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < now()
  `);
}
async function cycle(): Promise<void> {
  const [lock] = (await db.execute(sql`SELECT pg_try_advisory_lock(hashtextextended('zephyx:queue:scheduler', 0)) AS locked`)).rows as Array<{ locked?: boolean }>;
  if (!lock?.locked) return;
  try {
    await recoverExpiredLeases();
    const published = await publishDueOutboxJobs();
    logger.info({ queue: "email-scheduled", published, status: "completed" }, "Scheduler cycle completed");
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(hashtextextended('zephyx:queue:scheduler', 0))`);
  }
}
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  logger.info({ signal, status: "stopping" }, "Scheduler graceful shutdown started");
  await cycle().catch((error) => logger.error({ err: error, status: "failed" }, "Final scheduler cycle failed"));
  await closeOutboxQueue();
  await pool.end();
  process.exit(0);
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
void cycle().catch((error) => logger.error({ err: error, status: "failed" }, "Scheduler cycle failed"));
timer = setInterval(() => void cycle().catch((error) => logger.error({ err: error, status: "failed" }, "Scheduler cycle failed")), intervalMs);
timer.unref();
logger.info({ intervalMs, status: "ready" }, "Scheduler started");
