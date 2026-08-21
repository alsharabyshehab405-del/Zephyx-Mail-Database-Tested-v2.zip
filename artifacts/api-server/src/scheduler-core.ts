import { sql } from "drizzle-orm";
import { db, emailDispatchOutboxTable } from "@workspace/db";
import { publishOutboxJob, releasePublishingOutboxJob, reserveDueOutboxJobs } from "./lib/outbox.js";

export type SchedulerCycleResult = { locked: boolean; published: number };

export async function runSchedulerCycle(): Promise<SchedulerCycleResult> {
  const reserved = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtextextended('zephyx:queue:scheduler', 0)) AS locked`);
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
    return reserveDueOutboxJobs(tx, 100);
  });
  if (!reserved) return { locked: false, published: 0 };

  let published = 0;
  for (const outbox of reserved) {
    try {
      await publishOutboxJob(outbox);
      published += 1;
    } catch (error) {
      await releasePublishingOutboxJob(outbox.id, error);
    }
  }
  return { locked: true, published };
}
