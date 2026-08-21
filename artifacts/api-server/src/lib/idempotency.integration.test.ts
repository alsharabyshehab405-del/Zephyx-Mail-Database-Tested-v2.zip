import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, emailsTable, idempotencyKeysTable, usersTable } from "@workspace/db";
import { claimSendIdempotency, completeSendIdempotency, failSendIdempotency, requestHash } from "./idempotency.js";

const userId = crypto.randomUUID();
const key = `concurrent-${Date.now()}`;
const email = `idempotency-${Date.now()}@test.invalid`;
const emailId = `email-${Date.now()}`;

describe("Idempotency PostgreSQL concurrency", () => {
  it("allows exactly one concurrent claim", async () => {
    await db.insert(usersTable).values({ id: userId, email, passwordHash: "test-hash", firstName: "Test", lastName: "Idempotency" });
    await db.insert(emailsTable).values({ id: emailId, userId, fromEmail: email, subject: "Idempotency fixture" });
    const [first, second] = await Promise.all([
      claimSendIdempotency(userId, key, { b: 2, a: 1 }),
      claimSendIdempotency(userId, key, { a: 1, b: 2 }),
    ]);
    expect([first.kind, second.kind].filter((kind) => kind === "claimed")).toHaveLength(1);
    expect([first.kind, second.kind].some((kind) => kind === "processing")).toBe(true);
  });

  it("replays completed response and rejects a different canonical payload", async () => {
    await completeSendIdempotency(userId, key, emailId, 201, { id: emailId });
    const replay = await claimSendIdempotency(userId, key, { a: 1, b: 2 });
    expect(replay).toMatchObject({ kind: "completed", emailId, responseStatus: 201 });
    await expect(claimSendIdempotency(userId, key, { a: 2, b: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect(requestHash({ b: 2, a: 1 })).toBe(requestHash({ a: 1, b: 2 }));
  });

  it("allows exactly one concurrent failed recovery", async () => {
    const failedKey = `${key}-failed`;
    const claim = await claimSendIdempotency(userId, failedKey, { a: 1 });
    expect(claim.kind).toBe("claimed");
    await failSendIdempotency(userId, failedKey, 502, { error: "upstream unavailable" });
    const [firstRetry, secondRetry] = await Promise.all([
      claimSendIdempotency(userId, failedKey, { a: 1 }),
      claimSendIdempotency(userId, failedKey, { a: 1 }),
    ]);
    expect([firstRetry.kind, secondRetry.kind].filter((kind) => kind === "claimed")).toHaveLength(1);
    expect([firstRetry.kind, secondRetry.kind].some((kind) => kind === "processing")).toBe(true);
  });

  it("reclaims an expired key with a new hash and clears old response fields", async () => {
    const expiredKey = `${key}-expired`;
    const oldHash = requestHash({ old: true });
    const oldCreatedAt = new Date(Date.now() - 60 * 60 * 1000);
    const oldExpiresAt = new Date(Date.now() - 1_000);
    await db.insert(idempotencyKeysTable).values({ userId, key: expiredKey, requestHash: oldHash, emailId, status: "completed", responseStatus: 201, responseBody: { id: emailId, old: true }, createdAt: oldCreatedAt, expiresAt: oldExpiresAt });
    const newPayload = { new: true, order: 2 };
    const claim = await claimSendIdempotency(userId, expiredKey, newPayload);
    expect(claim).toEqual({ kind: "claimed", key: expiredKey });
    const [row] = await db.select().from(idempotencyKeysTable).where(eq(idempotencyKeysTable.key, expiredKey));
    expect(row?.requestHash).toBe(requestHash(newPayload));
    expect(row?.status).toBe("processing");
    expect(row?.emailId).toBeNull();
    expect(row?.responseStatus).toBeNull();
    expect(row?.responseBody).toBeNull();
    expect(row?.createdAt.getTime()).toBeGreaterThan(oldCreatedAt.getTime());
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const next = await claimSendIdempotency(userId, expiredKey, newPayload);
    expect(next.kind).toBe("processing");
  });

  afterAll(async () => {
    await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.userId, userId));
    await db.delete(emailsTable).where(eq(emailsTable.id, emailId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
