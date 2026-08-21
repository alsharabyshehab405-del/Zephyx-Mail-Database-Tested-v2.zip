import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, idempotencyKeysTable } from "@workspace/db";

export async function claimSendIdempotency(userId: string, key: string, body: unknown): Promise<{ replayEmailId: string | null; claimed: boolean }> {
  const normalized = key.trim();
  if (!normalized || normalized.length > 128) throw Object.assign(new Error("Invalid Idempotency-Key"), { statusCode: 400 });
  const requestHash = crypto.createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
  const existing = await db.select().from(idempotencyKeysTable).where(and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.key, normalized), gt(idempotencyKeysTable.expiresAt, new Date()))).limit(1);
  if (existing[0]) {
    if (existing[0].requestHash !== requestHash) throw Object.assign(new Error("Idempotency-Key was already used with a different request"), { statusCode: 409 });
    return { replayEmailId: existing[0].emailId ?? null, claimed: false };
  }
  await db.insert(idempotencyKeysTable).values({ userId, key: normalized, requestHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }).onConflictDoNothing();
  return { replayEmailId: null, claimed: true };
}

export async function completeSendIdempotency(userId: string, key: string, emailId: string): Promise<void> {
  await db.update(idempotencyKeysTable).set({ emailId, status: "completed" }).where(and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.key, key)));
}
