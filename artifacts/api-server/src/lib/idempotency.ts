import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, idempotencyKeysTable, type IdempotencyKey } from "@workspace/db";

export type IdempotencyClaim =
  | { kind: "claimed"; key: string }
  | { kind: "completed"; key: string; emailId: string | null; responseStatus: number | null; responseBody: unknown }
  | { kind: "processing"; key: string }
  | { kind: "failed"; key: string; responseStatus: number | null; responseBody: unknown };

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}
export function canonicalJson(value: unknown): string { return JSON.stringify(canonicalize(value)); }
export function requestHash(value: unknown): string { return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function nextExpiry(): Date { return new Date(Date.now() + IDEMPOTENCY_TTL_MS); }
function toResult(row: IdempotencyKey): Exclude<IdempotencyClaim, { kind: "claimed" }> {
  if (row.status === "completed") return { kind: "completed", key: row.key, emailId: row.emailId, responseStatus: row.responseStatus, responseBody: row.responseBody };
  if (row.status === "failed") return { kind: "failed", key: row.key, responseStatus: row.responseStatus, responseBody: row.responseBody };
  return { kind: "processing", key: row.key };
}

export async function claimSendIdempotency(userId: string, key: string, body: unknown): Promise<IdempotencyClaim> {
  const normalized = key.trim();
  if (!normalized || normalized.length > 128) throw Object.assign(new Error("Invalid Idempotency-Key"), { statusCode: 400 });
  const hash = requestHash(body);
  const [claimedRow] = await db.insert(idempotencyKeysTable).values({ userId, key: normalized, requestHash: hash, expiresAt: nextExpiry() }).onConflictDoUpdate({
    target: [idempotencyKeysTable.userId, idempotencyKeysTable.key],
    set: {
      requestHash: hash,
      status: "processing",
      emailId: null,
      responseStatus: null,
      responseBody: null,
      createdAt: sql`now()`,
      expiresAt: nextExpiry(),
    },
    where: sql`${idempotencyKeysTable.expiresAt} <= now()`,
  }).returning();
  if (claimedRow) return { kind: "claimed", key: normalized };

  const [existing] = await db.select().from(idempotencyKeysTable).where(and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.key, normalized))).limit(1);
  if (!existing) return claimSendIdempotency(userId, normalized, body);
  if (existing.expiresAt <= new Date()) return claimSendIdempotency(userId, normalized, body);
  if (existing.requestHash !== hash) throw Object.assign(new Error("Idempotency-Key was already used with a different request"), { statusCode: 409 });

  if (existing.status === "failed") {
    const [retryClaim] = await db.update(idempotencyKeysTable).set({
      requestHash: hash,
      status: "processing",
      emailId: null,
      responseStatus: null,
      responseBody: null,
      createdAt: sql`now()`,
      expiresAt: nextExpiry(),
    }).where(and(eq(idempotencyKeysTable.id, existing.id), eq(idempotencyKeysTable.status, "failed"), eq(idempotencyKeysTable.requestHash, hash))).returning();
    if (retryClaim) return { kind: "claimed", key: normalized };
  }
  return toResult(existing);
}

export async function completeSendIdempotency(userId: string, key: string, emailId: string, responseStatus: number, responseBody: unknown): Promise<void> {
  await db.update(idempotencyKeysTable).set({ emailId, status: "completed", responseStatus, responseBody }).where(and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.status, "processing")));
}
export async function failSendIdempotency(userId: string, key: string, responseStatus: number, responseBody: unknown): Promise<void> {
  await db.update(idempotencyKeysTable).set({ status: "failed", responseStatus, responseBody }).where(and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.key, key), eq(idempotencyKeysTable.status, "processing")));
}
