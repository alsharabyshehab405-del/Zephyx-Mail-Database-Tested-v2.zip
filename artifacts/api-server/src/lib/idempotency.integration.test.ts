import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, idempotencyKeysTable, usersTable } from "@workspace/db";
import { claimSendIdempotency, completeSendIdempotency, failSendIdempotency, requestHash } from "./idempotency.js";

const userId = crypto.randomUUID();
const key = `concurrent-${Date.now()}`;
const email = `idempotency-${Date.now()}@test.invalid`;

describe("Idempotency PostgreSQL concurrency", () => {
  it("allows exactly one concurrent claim", async () => {
    await db.insert(usersTable).values({ id: userId, email, passwordHash: "test-hash", firstName: "Test", lastName: "Idempotency" });
    const [first, second] = await Promise.all([
      claimSendIdempotency(userId, key, { b: 2, a: 1 }),
      claimSendIdempotency(userId, key, { a: 1, b: 2 }),
    ]);
    expect([first.kind, second.kind].filter((kind) => kind === "claimed")).toHaveLength(1);
    expect([first.kind, second.kind].some((kind) => kind === "processing")).toBe(true);
  });

  it("replays completed response and rejects a different canonical payload", async () => {
    await completeSendIdempotency(userId, key, "email-one", 201, { id: "email-one" });
    const replay = await claimSendIdempotency(userId, key, { a: 1, b: 2 });
    expect(replay).toMatchObject({ kind: "completed", emailId: "email-one", responseStatus: 201 });
    await expect(claimSendIdempotency(userId, key, { a: 2, b: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect(requestHash({ b: 2, a: 1 })).toBe(requestHash({ a: 1, b: 2 }));
  });

  it("makes a failed claim recoverable and does not leave it processing", async () => {
    const failedKey = `${key}-failed`;
    const claim = await claimSendIdempotency(userId, failedKey, { a: 1 });
    expect(claim.kind).toBe("claimed");
    await failSendIdempotency(userId, failedKey, 502, { error: "upstream unavailable" });
    const retry = await claimSendIdempotency(userId, failedKey, { a: 1 });
    expect(retry.kind).toBe("claimed");
  });

  afterAll(async () => {
    await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
