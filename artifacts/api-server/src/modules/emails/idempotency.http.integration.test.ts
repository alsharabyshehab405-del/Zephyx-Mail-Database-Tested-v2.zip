import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, emailsTable, idempotencyKeysTable, usersTable } from "@workspace/db";
import app from "../../app.js";
import { requestHash } from "../../lib/idempotency.js";

const runId = `http-${Date.now()}`;
const email = `idempotency-${runId}@test.invalid`;
const password = "TestPass_123!";
let token = "";
let userId = "";

async function emailCount(): Promise<number> {
  const rows = await db.select({ id: emailsTable.id }).from(emailsTable).where(eq(emailsTable.userId, userId));
  return rows.length;
}

describe("Idempotency HTTP integration", () => {
  beforeAll(async () => {
    const response = await request(app).post("/api/auth/register").send({ email, password, firstName: "HTTP", lastName: "Idempotency" });
    expect(response.status).toBe(201);
    token = response.body.accessToken as string;
    userId = response.body.user.id as string;
  });

  it("creates one Email for concurrent POST /api/emails and replays the same emailId", async () => {
    const key = `http-send-${runId}`;
    const payload = { subject: `Concurrent ${runId}`, to: [{ email: "recipient@test.invalid" }], bodyText: "hello", bodyHtml: "<p>hello</p>" };
    const [first, second] = await Promise.all([
      request(app).post("/api/emails").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send(payload),
      request(app).post("/api/emails").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send(payload),
    ]);
    expect([first.status, second.status].every((status) => status === 201 || status === 409)).toBe(true);
    expect([first.status, second.status].filter((status) => status === 201)).not.toHaveLength(0);
    const ids = [first.body?.id, second.body?.id].filter(Boolean);
    expect(new Set(ids).size).toBe(1);
    expect(await emailCount()).toBe(1);
    const replay = await request(app).post("/api/emails").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(ids[0]);
    expect(await emailCount()).toBe(1);
    const conflict = await request(app).post("/api/emails").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send({ ...payload, subject: "different" });
    expect(conflict.status).toBe(409);
    expect(await emailCount()).toBe(1);
  });

  it("recovers one failed claim under concurrent retry without duplicate Emails", async () => {
    const key = `http-failed-${runId}`;
    const before = await emailCount();
    const payload = { subject: `Recovered ${runId}`, to: [{ email: "recipient@test.invalid" }], bodyText: "recovered", bodyHtml: "<p>recovered</p>" };
    await db.insert(idempotencyKeysTable).values({ userId, key, requestHash: requestHash(payload), status: "failed", responseStatus: 502, responseBody: { error: "transient" }, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    const [first, second] = await Promise.all([
      request(app).post("/api/emails").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send(payload),
      request(app).post("/api/emails").set("Authorization", `Bearer ${token}`).set("Idempotency-Key", key).send(payload),
    ]);
    expect([first.status, second.status].some((status) => status === 201)).toBe(true);
    expect([first.status, second.status].every((status) => status === 201 || status === 409)).toBe(true);
    expect(await emailCount()).toBe(before + 1);
  });

  afterAll(async () => {
    await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.userId, userId));
    await db.delete(emailsTable).where(eq(emailsTable.userId, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });
});
