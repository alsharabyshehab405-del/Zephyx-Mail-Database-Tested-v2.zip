import { and, eq, inArray } from "drizzle-orm";
import { db, emailsTable } from "@workspace/db";
import { dispatchClaimedEmail } from "./modules/emails/emails.service.js";
import type { Email } from "@workspace/db";
import { claimOutboxJob, completeOutboxJob, failOutboxJob, sanitizeQueueError, type EmailDispatchJob } from "./lib/outbox.js";
import type { QueueRuntimeConfig } from "./lib/queue-config.js";
import { logger } from "./lib/logger.js";

type WorkerJob = { id?: string; data: EmailDispatchJob; attemptsMade: number };
export type ProcessorResult = "completed" | "skipped" | "failed" | "dead_letter" | "delivery_unknown";

function isTimeoutOrUnknown(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  const code = String((error as { code?: unknown }).code ?? "");
  return error instanceof DOMException && error.name === "AbortError" || /abort|timeout|timed out|etimedout|econnreset|socket hang up|greeting never received|connection closed/i.test(message) || /ETIMEDOUT|ESOCKET|ECONNRESET|ECONNECTION/i.test(code);
}

function isPermanent(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number }).statusCode;
  return Boolean(statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429);
}

type ProcessorDependencies = { dispatch?: (email: Email, options: { markFailed: boolean; signal: AbortSignal }) => Promise<Email>; signal?: AbortSignal };
export async function processEmailDispatchJob(job: WorkerJob, config: QueueRuntimeConfig, dependencies: ProcessorDependencies = {}): Promise<ProcessorResult> {
  const startedAt = Date.now();
  const outbox = await claimOutboxJob(job.data.outboxId, config.leaseMs);
  if (!outbox) return "skipped";

  const [email] = await db.select().from(emailsTable).where(eq(emailsTable.id, outbox.emailId)).limit(1);
  if (!email) {
    const result = await failOutboxJob(outbox, new Error("Email row missing"), config.backoffMs, true);
    return result;
  }
  if (email.status === "sent") {
    await completeOutboxJob(outbox.id, Date.now() - startedAt);
    return "completed";
  }
  if (email.status === "sending") {
    return await failOutboxJob(outbox, new Error("Email was already sending when lease was reclaimed"), config.backoffMs, false, true);
  }
  const [claimedEmail] = await db.update(emailsTable).set({ status: "sending", sendError: null }).where(and(eq(emailsTable.id, outbox.emailId), inArray(emailsTable.status, ["pending_send", "scheduled", "failed"]))).returning();
  if (!claimedEmail) {
    const [current] = await db.select({ status: emailsTable.status }).from(emailsTable).where(eq(emailsTable.id, outbox.emailId)).limit(1);
    if (current?.status === "sent") await completeOutboxJob(outbox.id, Date.now() - startedAt);
    else await failOutboxJob(outbox, new Error("Email is not deliverable"), config.backoffMs, true);
    return "skipped";
  }

  const controller = new AbortController();
  const externalSignal = dependencies.signal;
  const forwardAbort = () => controller.abort(externalSignal?.reason ?? new Error("Worker is shutting down"));
  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("SMTP delivery timeout; result may be unknown")), config.jobTimeoutMs);
  timeout.unref();
  try {
    await (dependencies.dispatch ?? dispatchClaimedEmail)(claimedEmail, { markFailed: false, signal: controller.signal });
    await completeOutboxJob(outbox.id, Date.now() - startedAt);
    logger.info({ jobId: job.id, queue: "email-scheduled", attempt: outbox.attempts, durationMs: Date.now() - startedAt, status: "completed" }, "Queue job completed");
    return "completed";
  } catch (error) {
    const unknown = isTimeoutOrUnknown(error);
    const permanent = isPermanent(error);
    const result = await failOutboxJob(outbox, error, config.backoffMs, permanent, unknown);
    logger.error({ jobId: job.id, queue: "email-scheduled", attempt: outbox.attempts, durationMs: Date.now() - startedAt, status: result, error: sanitizeQueueError(error) }, "Queue job failed");
    return result;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}
