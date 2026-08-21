import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db, emailDispatchOutboxTable, emailsTable, type EmailDispatchOutbox } from "@workspace/db";
import { createQueue, loadQueueConfig, queueJobId, queueMaxAttempts, QUEUE_NAMES, type QueueName, type QueueRuntimeConfig } from "./queue-config.js";
import { logger } from "./logger.js";

export type DbExecutor = Pick<typeof db, "insert" | "select" | "update" | "execute">;
export type EmailDispatchJob = { outboxId: string; emailId: string; correlationId: string; jobKey: string };
let queueContext: ReturnType<typeof createQueue<EmailDispatchJob>> | null = null;

function getEmailQueue(config = loadQueueConfig()) {
  if (!queueContext) queueContext = createQueue<EmailDispatchJob>(QUEUE_NAMES.emailScheduled, config);
  return queueContext;
}
export function dispatchJobId(jobKey: string): string { return queueJobId(QUEUE_NAMES.emailScheduled, jobKey); }

export async function insertEmailDispatchOutbox(
  executor: DbExecutor,
  input: { emailId: string; availableAt: Date; correlationId: string; maxAttempts?: number },
): Promise<EmailDispatchOutbox> {
  const jobKey = `email:${input.emailId}`;
  const [created] = await executor.insert(emailDispatchOutboxTable).values({
    emailId: input.emailId,
    jobKey,
    queueName: QUEUE_NAMES.emailScheduled,
    availableAt: input.availableAt,
    correlationId: input.correlationId,
    maxAttempts: input.maxAttempts ?? queueMaxAttempts(),
  }).onConflictDoNothing({ target: emailDispatchOutboxTable.jobKey }).returning();
  const outbox = created ?? (await executor.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.jobKey, jobKey)).limit(1))[0];
  if (!outbox) throw new Error("Could not create email dispatch outbox record");
  return outbox;
}

export async function publishOutboxJob(outbox: EmailDispatchOutbox, config: QueueRuntimeConfig = loadQueueConfig()): Promise<void> {
  if (!config.redisUrl || outbox.status === "delivery_unknown" || outbox.status === "dead_letter" || outbox.status === "completed") return;
  const { queue } = getEmailQueue(config);
  const jobId = dispatchJobId(outbox.jobKey);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (["active", "waiting", "waiting-children", "delayed"].includes(state)) return;
    // A failed Redis job is removed only after PostgreSQL has recorded failed state.
    if (state === "failed" || state === "completed") await existing.remove();
  }
  await queue.add(outbox.queueName, {
    outboxId: outbox.id,
    emailId: outbox.emailId,
    correlationId: outbox.correlationId ?? outbox.id,
    jobKey: outbox.jobKey,
  }, { jobId, attempts: 1, removeOnComplete: true, removeOnFail: false });
}

export async function reserveDueOutboxJobs(executor: DbExecutor, limit = 100, now = new Date(), leaseMs?: number): Promise<EmailDispatchOutbox[]> {
  const effectiveLeaseMs = leaseMs ?? loadQueueConfig().leaseMs;
  const due = await executor.select().from(emailDispatchOutboxTable).where(and(
    or(eq(emailDispatchOutboxTable.status, "pending"), eq(emailDispatchOutboxTable.status, "failed")),
    lte(emailDispatchOutboxTable.availableAt, now),
    or(sql`${emailDispatchOutboxTable.nextAttemptAt} IS NULL`, lte(emailDispatchOutboxTable.nextAttemptAt, now)),
    sql`${emailDispatchOutboxTable.attempts} < ${emailDispatchOutboxTable.maxAttempts}`,
  )).limit(limit);
  if (due.length === 0) return [];
  return executor.update(emailDispatchOutboxTable).set({ status: "publishing", leaseExpiresAt: new Date(now.getTime() + effectiveLeaseMs), updatedAt: new Date() }).where(inArray(emailDispatchOutboxTable.id, due.map((row) => row.id))).returning();
}

export async function releasePublishingOutboxJob(outboxId: string, error: unknown): Promise<void> {
  await db.update(emailDispatchOutboxTable).set({ status: "failed", leaseExpiresAt: null, nextAttemptAt: new Date(), lastError: sanitizeQueueError(error), updatedAt: new Date() }).where(and(eq(emailDispatchOutboxTable.id, outboxId), eq(emailDispatchOutboxTable.status, "publishing")));
}

export async function publishDueOutboxJobs(limit = 100, config: QueueRuntimeConfig = loadQueueConfig()): Promise<number> {
  if (!process.env.REDIS_URL) return 0;
  const due = await reserveDueOutboxJobs(db, limit, new Date(), config.leaseMs);
  let published = 0;
  for (const outbox of due) {
    try { await publishOutboxJob(outbox, config); published += 1; }
    catch (error) { await releasePublishingOutboxJob(outbox.id, error); logger.warn({ queue: outbox.queueName, jobId: dispatchJobId(outbox.jobKey), status: "deferred" }, "Could not publish outbox job"); }
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
        next_attempt_at = NULL,
        updated_at = now()
    WHERE id = ${outboxId}
      AND attempts < max_attempts
      AND (
        (status IN ('pending'::dispatch_status, 'publishing'::dispatch_status) AND available_at <= ${now})
        OR (status = 'failed' AND (next_attempt_at IS NULL OR next_attempt_at <= ${now}))
        OR (status = 'processing' AND lease_expires_at < ${now})
      )
    RETURNING id
  `);
  const claimedId = (result.rows[0] as { id?: string } | undefined)?.id;
  if (!claimedId) return null;
  return (await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, claimedId)).limit(1))[0] ?? null;
}

export function sanitizeQueueError(error: unknown): string {
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

export async function failOutboxJob(outbox: EmailDispatchOutbox, error: unknown, backoffMs: number, forceDeadLetter = false, deliveryUnknown = false): Promise<"failed" | "dead_letter" | "delivery_unknown"> {
  const dead = forceDeadLetter || outbox.attempts >= outbox.maxAttempts;
  const status = deliveryUnknown ? "delivery_unknown" : dead ? "dead_letter" : "failed";
  const nextAttemptAt = new Date(Date.now() + backoffMs * (2 ** Math.max(0, outbox.attempts - 1)));
  const safeMessage = deliveryUnknown ? "Delivery result unknown; manual reconciliation required" : sanitizeQueueError(error);
  await db.transaction(async (tx) => {
    await tx.update(emailDispatchOutboxTable).set({
      status,
      leaseExpiresAt: null,
      lastError: safeMessage,
      nextAttemptAt: status === "failed" ? nextAttemptAt : null,
      updatedAt: new Date(),
    }).where(and(eq(emailDispatchOutboxTable.id, outbox.id), eq(emailDispatchOutboxTable.status, "processing")));
    await tx.update(emailsTable).set({ status: "failed", sendError: safeMessage, scheduledAt: null }).where(and(eq(emailsTable.id, outbox.emailId), eq(emailsTable.status, "sending")));
  });
  return status;
}

export async function closeOutboxQueue(): Promise<void> {
  if (!queueContext) return;
  await queueContext.queue.close();
  await queueContext.connection.quit();
  queueContext = null;
}
