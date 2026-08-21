import { eq, inArray } from "drizzle-orm";
import { createServer, type Socket } from "node:net";
import { db, emailDispatchOutboxTable, emailsTable, usersTable } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processEmailDispatchJob } from "./worker-processor.js";
import type { QueueRuntimeConfig } from "./lib/queue-config.js";
import { createSmtpMailerForTest } from "./lib/mailer.js";

const userId = crypto.randomUUID();
const userEmail = `processor-${Date.now()}@test.invalid`;
const config: QueueRuntimeConfig = { redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379", prefix: `processor-${Date.now()}`, concurrency: 2, maxAttempts: 3, backoffMs: 10, jobTimeoutMs: 40, smtpTimeouts: { connectionTimeoutMs: 10, greetingTimeoutMs: 10, socketTimeoutMs: 20 }, leaseMs: 100, shutdownTimeoutMs: 1_000, hardShutdownTimeoutMs: 2_000, workerLockDurationMs: 2_000, schedulerEnabled: false };
const fixtureEmailIds: string[] = [];
const fixtureOutboxIds: string[] = [];

async function fixture(label: string, options: { maxAttempts?: number; emailStatus?: "scheduled" | "sending" } = {}) {
  const emailId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: userEmail, subject: label, status: options.emailStatus ?? "scheduled", scheduledAt: new Date(Date.now() - 1000) });
  await db.insert(emailDispatchOutboxTable).values({ id: outboxId, emailId, jobKey: `email:${emailId}`, queueName: "email-scheduled", availableAt: new Date(Date.now() - 1000), maxAttempts: options.maxAttempts ?? 3 });
  fixtureEmailIds.push(emailId);
  fixtureOutboxIds.push(outboxId);
  return { emailId, outboxId, job: { id: `job-${outboxId}`, data: { outboxId, emailId, correlationId: `corr-${label}`, jobKey: `email:${emailId}` }, attemptsMade: 0 } };
}

async function markSent(emailId: string) {
  const [row] = await db.update(emailsTable).set({ status: "sent", folder: "sent", sentAt: new Date(), scheduledAt: null, sendError: null }).where(eq(emailsTable.id, emailId)).returning();
  return row;
}

describe("real Worker processor reliability", () => {
  beforeAll(async () => {
    await db.insert(usersTable).values({ id: userId, email: userEmail, passwordHash: "test-hash", firstName: "Worker", lastName: "Processor" });
  });

  it("sends once with two concurrent processors and zero sends after completion", async () => {
    const item = await fixture("single-send");
    let sends = 0;
    const dispatch = async () => { sends += 1; await markSent(item.emailId); return (await db.select().from(emailsTable).where(eq(emailsTable.id, item.emailId)).limit(1))[0]!; };
    const [first, second] = await Promise.all([processEmailDispatchJob(item.job, config, { dispatch }), processEmailDispatchJob(item.job, config, { dispatch })]);
    const third = await processEmailDispatchJob(item.job, config, { dispatch });
    expect(sends).toBe(1);
    expect([first, second].filter((value) => value === "completed")).toHaveLength(1);
    expect([first, second].some((value) => value === "skipped")).toBe(true);
    expect(third).toBe("skipped");
  });

  it("retries a temporary failure after nextAttemptAt and then completes once", async () => {
    const item = await fixture("temporary-retry");
    let sends = 0;
    const dispatch = async () => {
      sends += 1;
      if (sends === 1) throw Object.assign(new Error("temporary provider failure"), { statusCode: 503 });
      await markSent(item.emailId);
      return (await db.select().from(emailsTable).where(eq(emailsTable.id, item.emailId)).limit(1))[0]!;
    };
    expect(await processEmailDispatchJob(item.job, config, { dispatch })).toBe("failed");
    await db.update(emailDispatchOutboxTable).set({ nextAttemptAt: new Date(Date.now() - 1) }).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    expect(await processEmailDispatchJob(item.job, config, { dispatch })).toBe("completed");
    expect(sends).toBe(2);
  });

  it("moves permanent failure to dead_letter at the configured maxAttempts", async () => {
    const item = await fixture("dead-letter", { maxAttempts: 2 });
    let sends = 0;
    const dispatch = async () => { sends += 1; throw Object.assign(new Error("rejected permanently"), { statusCode: 400 }); };
    expect(await processEmailDispatchJob(item.job, config, { dispatch })).toBe("dead_letter");
    expect(await processEmailDispatchJob(item.job, config, { dispatch })).toBe("skipped");
    expect(sends).toBe(1);
  });

  it("recovers an expired processing lease after a simulated worker crash", async () => {
    const item = await fixture("lease-recovery", { emailStatus: "scheduled" });
    await db.update(emailDispatchOutboxTable).set({ status: "processing", attempts: 1, leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(emailDispatchOutboxTable.id, item.outboxId));
    let sends = 0;
    const dispatch = async () => { sends += 1; await markSent(item.emailId); return (await db.select().from(emailsTable).where(eq(emailsTable.id, item.emailId)).limit(1))[0]!; };
    expect(await processEmailDispatchJob(item.job, config, { dispatch })).toBe("completed");
    expect(sends).toBe(1);
  });

  it("uses a real SMTP socket timeout, records delivery_unknown, and never retries in the background", async () => {
    const item = await fixture("smtp-timeout");
    let activeConnections = 0;
    let sendAttempts = 0;
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      activeConnections += 1;
      socket.on("close", () => { sockets.delete(socket); activeConnections -= 1; });
      // Deliberately do not send the SMTP greeting. Nodemailer must enforce greetingTimeout.
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("SMTP test server did not expose a TCP port");
    const smtp = createSmtpMailerForTest({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(address.port),
      SMTP_SECURE: "false",
      SMTP_FROM: userEmail,
      SMTP_CONNECTION_TIMEOUT_MS: "100",
      SMTP_GREETING_TIMEOUT_MS: "100",
      SMTP_SOCKET_TIMEOUT_MS: "200",
    });
    const smtpConfig: QueueRuntimeConfig = { ...config, jobTimeoutMs: 500, leaseMs: 30_500, smtpTimeouts: { connectionTimeoutMs: 100, greetingTimeoutMs: 100, socketTimeoutMs: 200 } };
    try {
      const dispatch = async (email: never, options: { signal: AbortSignal }) => {
        sendAttempts += 1;
        await smtp.sendMessage({ to: ["smtp-timeout-recipient@test.invalid"], subject: "timeout", html: "timeout", text: "timeout" }, options.signal);
        return email;
      };
      expect(await processEmailDispatchJob(item.job, smtpConfig, { dispatch })).toBe("delivery_unknown");
      expect(await processEmailDispatchJob(item.job, smtpConfig, { dispatch })).toBe("skipped");
      await new Promise((resolve) => setTimeout(resolve, 300));
      const [outbox] = await db.select().from(emailDispatchOutboxTable).where(eq(emailDispatchOutboxTable.id, item.outboxId));
      expect(outbox?.status).toBe("delivery_unknown");
      expect(sendAttempts).toBe(1);
      expect(activeConnections).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  afterAll(async () => {
    if (fixtureOutboxIds.length > 0) await db.delete(emailDispatchOutboxTable).where(inArray(emailDispatchOutboxTable.id, fixtureOutboxIds));
    if (fixtureEmailIds.length > 0) await db.delete(emailsTable).where(inArray(emailsTable.id, fixtureEmailIds));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
