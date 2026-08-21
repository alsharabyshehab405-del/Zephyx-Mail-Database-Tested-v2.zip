import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { dispatchClaimedEmail, claimNextEmailForDelivery } from "./emails.service.js";
import { logger } from "../../lib/logger.js";

let schedulerTimer: NodeJS.Timeout | null = null;
let cycleRunning = false;

function schedulerIntervalMs(): number {
  const parsed = Number.parseInt(process.env.EMAIL_SCHEDULER_INTERVAL_MS ?? "1000", 10);
  return Number.isInteger(parsed) ? Math.min(30_000, Math.max(500, parsed)) : 1000;
}

async function recoverStaleClaims(): Promise<void> {
  await db.execute(sql`
    UPDATE emails
    SET status = CASE WHEN scheduled_at > NOW() THEN 'scheduled'::email_status ELSE 'pending_send'::email_status END
    WHERE status = 'sending'::email_status
      AND scheduled_at < NOW() - INTERVAL '10 minutes'
  `);
}

async function runDeliveryCycle(): Promise<void> {
  if (cycleRunning) return;
  cycleRunning = true;

  try {
    for (let processed = 0; processed < 20; processed += 1) {
      const claimed = await claimNextEmailForDelivery();
      if (!claimed) break;

      try {
        await dispatchClaimedEmail(claimed);
      } catch (error: unknown) {
        logger.error({ err: error, emailId: claimed.id }, "Scheduled email delivery failed");
      }
    }
  } finally {
    cycleRunning = false;
  }
}

export function startEmailScheduler(): () => void {
  if (schedulerTimer) return () => stopEmailScheduler();

  void recoverStaleClaims().catch((error: unknown) => {
    logger.error({ err: error }, "Could not recover stale scheduled email claims");
  });
  const safeRunDeliveryCycle = () => {
    void runDeliveryCycle().catch((error: unknown) => {
      logger.error({ err: error }, "Email scheduler cycle failed");
    });
  };

  safeRunDeliveryCycle();
  schedulerTimer = setInterval(safeRunDeliveryCycle, schedulerIntervalMs());
  schedulerTimer.unref();

  logger.info({ intervalMs: schedulerIntervalMs() }, "Email scheduler started");
  return () => stopEmailScheduler();
}

export function stopEmailScheduler(): void {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
  logger.info("Email scheduler stopped");
}
