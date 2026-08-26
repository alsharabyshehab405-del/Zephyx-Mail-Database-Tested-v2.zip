import { sql } from "drizzle-orm";
import { db, emailDispatchOutboxTable } from "@workspace/db";
import { publishOutboxJob, releasePublishingOutboxJob, reserveDueOutboxJobs } from "./lib/outbox.js";
import { loadQueueConfig, type QueueRuntimeConfig } from "./lib/queue-config.js";
import { reconcileOpenFollowUps } from "./modules/productivity/productivity.service.js";

export type SchedulerCycleResult = { locked: boolean; reserved: number; published: number; followUpsReconciled: number };

export async function runSchedulerCycle(config: QueueRuntimeConfig = loadQueueConfig(), lockKey = "zephyx:queue:scheduler"): Promise<SchedulerCycleResult> {
  const followUpReconciliation = await reconcileOpenFollowUps(`${lockKey}:follow-ups`);
  const reserved = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS locked`);
    const acquired = Boolean((result.rows[0] as { locked?: boolean } | undefined)?.locked);
    if (!acquired) return null;
    await tx.execute(sql`
      UPDATE email_dispatch_outbox
      SET status = CASE WHEN attempts >= max_attempts THEN 'dead_letter'::dispatch_status ELSE 'failed'::dispatch_status END,
          lease_expires_at = NULL,
          next_attempt_at = CASE WHEN attempts >= max_attempts THEN NULL ELSE now() END,
          updated_at = now()
      WHERE status = 'processing'::dispatch_status
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < now()
    `);
    await tx.execute(sql`
      UPDATE email_dispatch_outbox
      SET status = CASE WHEN attempts >= max_attempts THEN 'dead_letter'::dispatch_status ELSE 'failed'::dispatch_status END,
          lease_expires_at = NULL,
          next_attempt_at = CASE WHEN attempts >= max_attempts THEN NULL ELSE now() END,
          updated_at = now()
      WHERE status = 'publishing'::dispatch_status
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at < now()
    `);
    return reserveDueOutboxJobs(tx, 100, new Date(), config.leaseMs);
  });
  if (!reserved) return { locked: false, reserved: 0, published: 0, followUpsReconciled: followUpReconciliation.closed };

  let published = 0;
  const reservedCount = reserved.length;
  for (const outbox of reserved) {
    try {
      await publishOutboxJob(outbox, config);
      published += 1;
    } catch (error) {
      await releasePublishingOutboxJob(outbox.id, error);
    }
  }
  return { locked: true, reserved: reservedCount, published, followUpsReconciled: followUpReconciliation.closed };
}
