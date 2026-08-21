import { and, eq, lte, or, sql } from "drizzle-orm";
import { db, emailDispatchOutboxTable, type EmailDispatchOutbox } from "@workspace/db";
import { createQueue, queueJobId, QUEUE_NAMES, type QueueName } from "./queue-config.js";
import { logger } from "./logger.js";

export type EmailDispatchJob = { outboxId: string; emailId: string; correlationId: string; jobKey: string };
let queueContext: ReturnType<typeof createQueue<EmailDispatchJob>> | null = null;
function getEmailQueue() {
  if (!queueContext) queueContext = createQueue<EmailDispatchJob>(QUEUE_NAMES.emailScheduled);
  return queueContext;
}
export function dispatchJobId(jobKey: string): string { return queueJobId(QUEUE_NAMES.emailScheduled, jobKey); }

export async function ensureEmailDispatchOutbox(input: { emailId: string; availableAt: Date; correlationId: string }): Promise<EmailDispatchOutbox> {
  const jobKey = `email:${input.emailId}`;
  const [created] = await db.insert(emailDispatchOutboxTable).values({
    emailId: input.emailId,
    jobKey,
    queueName: QUEUE_NAMES.emailScheduled,
    availableAt: input.availableAt,
    correlationId: input.correlationId,
  }).onConflictDoNothing({ target: emailDispatchOutboxTable.jobKey }).returning();
  const outbox = created ?? (await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.jobKey, jobKey)).limit(1))[0];
  if (!outbox) throw new Error("Could not create email dispatch outbox record");
  if (outbox.availableAt <= new Date() && process.env.REDIS_URL) {
    try {
      await publishOutboxJob(outbox);
    } catch {
      logger.warn({ queue: outbox.queueName, jobId: dispatchJobId(outbox.jobKey), status: "deferred" }, "Redis publish deferred to scheduler");
    }
  }
  return outbox;
}

export async function publishOutboxJob(outbox: EmailDispatchOutbox): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const { queue } = getEmailQueue();
  await queue.add(outbox.queueName, { outboxId: outbox.id, emailId: outbox.emailId, correlationId: outbox.correlationId ?? outbox.id, jobKey: outbox.jobKey }, { jobId: dispatchJobId(outbox.jobKey) });
}

export async function publishDueOutboxJobs(limit = 100): Promise<number> {
  if (!process.env.REDIS_URL) return 0;
  const due = await db.select().from(emailDispatchOutboxTable).where(and(
    or(eq(emailDispatchOutboxTable.status, "pending"), eq(emailDispatchOutboxTable.status, "failed")),
    lte(emailDispatchOutboxTable.availableAt, new Date()),
    or(sql`${emailDispatchOutboxTable.nextAttemptAt} IS NULL`, lte(emailDispatchOutboxTable.nextAttemptAt, new Date())),
  )).limit(limit);
  let published = 0;
  for (const outbox of due) {
    try { await publishOutboxJob(outbox); published += 1; } catch (error) { logger.warn({ queue: outbox.queueName, jobId: dispatchJobId(outbox.jobKey) }, "Could not publish outbox job"); }
  }
  return published;
}

export async function claimOutboxJob(outboxId: string, leaseMs: number, now = new Date()): Promise<EmailDispatchOutbox | null> {
  const lease = new Date(now.getTime() + leaseMs);
  const result = await db.execute(sql`
    UPDATE email_dispatch_outbox
    SET status = 'processing'::dispatch_status,
        attempts = attempts + 1,
        lease_expires_at = ${lease},
        updated_at = now()
    WHERE id = ${outboxId}
      AND attempts < max_attempts
      AND (
        (status = 'pending' AND available_at <= ${now})
        OR (status = 'failed' AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}))
        OR (status = 'processing' AND lease_expires_at < ${now})
      )
    RETURNING id
  `);
  const claimedId = (result.rows[0] as { id?: string } | undefined)?.id;
  if (!claimedId) return null;
  return (await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, claimedId)).limit(1))[0] ?? null;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Job failed";
  return message
    .replace(/redis:\/\/[^\s]+/gi, "redis://[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/(password|token|secret|authorization)=?[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[address-redacted]")
    .slice(0, 500);
}
export async function completeOutboxJob(outboxId: string, durationMs?: number): Promise<void> {
  await db.update(emailDispatchOutboxTable).set({ status: "completed", leaseExpiresAt: null, completedAt: new Date(), durationMs, updatedAt: new Date(), lastError: null }).where(and(eq(emailDispatchOutboxTable.id, outboxId), eq(emailDispatchOutboxTable.status, "processing")));
}
export async function failOutboxJob(outbox: EmailDispatchOutbox, error: unknown, backoffMs: number, forceDeadLetter = false): Promise<"failed" | "dead_letter"> {
  const dead = forceDeadLetter || outbox.attempts >= outbox.maxAttempts;
  const nextAttemptAt = new Date(Date.now() + backoffMs * (2 ** Math.max(0, outbox.attempts - 1)));
  await db.update(emailDispatchOutboxTable).set({
    status: dead ? "dead_letter" : "failed",
    leaseExpiresAt: null,
    lastError: safeErrorMessage(error),
    nextAttemptAt: dead ? null : nextAttemptAt,
    updatedAt: new Date(),
  }).where(and(eq(emailDispatchOutboxTable.id, outbox.id), eq(emailDispatchOutboxTable.status, "processing")));
  return dead ? "dead_letter" : "failed";
}
export async function closeOutboxQueue(): Promise<void> {
  if (!queueContext) return;
  await queueContext.queue.close();
  await queueContext.connection.quit();
  queueContext = null;
}
