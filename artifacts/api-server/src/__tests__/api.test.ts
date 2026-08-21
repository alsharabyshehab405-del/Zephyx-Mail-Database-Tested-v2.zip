/**
 * NovaMail API — Integration Test Suite
 *
 * Strategy:
 *  - Creates unique test users per run (alice_<RUN_ID>, bob_<RUN_ID>)
 *  - Cleans up ONLY the data it created in afterAll
 *  - Never calls prisma migrate reset / never drops the DB
 *  - Rate-limit env is set to 100 in vitest.config so auth calls don't 429
 *  - Rate-limit behavior is tested via an isolated mini-app with max=3
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import request from "supertest";
import express from "express";
import rateLimit from "express-rate-limit";
import { createEmailActionRateLimit } from "../middlewares/rate-limit.js";
import { getFakeMailer } from "../lib/mailer.js";

import app from "../app.js";
import { db, emailsTable, pool, refreshTokensTable, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { prisma } from "../lib/prisma.js";

// ── Unique identifiers for this test run ──────────────────────────────────────
const RUN_ID = `r${Date.now()}`;
const ALICE_EMAIL = `alice_${RUN_ID}@novamail.test`;
const BOB_EMAIL = `bob_${RUN_ID}@novamail.test`;
const PASSWORD = "TestPass_123!";
const AUTH_EMAIL = `auth_${RUN_ID}@novamail.test`;
const AUTH_NEW_PASSWORD = "NewTestPass_456!";

// ── Shared state populated by tests in order ──────────────────────────────────
const testUserIds: string[] = [];

let aliceToken: string;
let aliceRefresh: string;
let aliceId: string;
let bobToken: string;
let bobId: string;
let authToken: string;
let authRefresh: string;
let authId: string;
let verificationToken: string;
let sessionAccessA: string;
let sessionRefreshA: string;
let sessionAccessB: string;
let sessionRefreshB: string;
let resetToken: string;

/** Alice's sent-copy id (folder=sent) */
let sentEmailId: string;
/** Bob's inbox-copy id (folder=inbox) — used as replyToId from Bob's perspective */
let bobReceivedEmailId: string;
/** Bob's reply email id */
let replyEmailId: string;
/** Draft id */
let draftEmailId: string;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Register Alice
  const regA = await request(app)
    .post("/api/auth/register")
    .send({ email: ALICE_EMAIL, password: PASSWORD, firstName: "Alice", lastName: `Test_${RUN_ID}` });

  expect(regA.status, "Alice registration failed").toBe(201);
  aliceToken = regA.body.accessToken as string;
  aliceRefresh = regA.body.refreshToken as string;
  aliceId = regA.body.user.id as string;
  testUserIds.push(aliceId);

  // Register Bob
  const regB = await request(app)
    .post("/api/auth/register")
    .send({ email: BOB_EMAIL, password: PASSWORD, firstName: "Bob", lastName: `Test_${RUN_ID}` });

  expect(regB.status, "Bob registration failed").toBe(201);
  bobToken = regB.body.accessToken as string;
  bobId = regB.body.user.id as string;
  testUserIds.push(bobId);

  // Register a dedicated account for verification, session, and reset tests.
  const regAuth = await request(app)
    .post("/api/auth/register")
    .set("User-Agent", "NovaMail Phase2 Test Client")
    .send({
      email: AUTH_EMAIL,
      password: PASSWORD,
      firstName: "Auth",
      lastName: `Test_${RUN_ID}`,
    });

  expect(regAuth.status, "Phase-2 test user registration failed").toBe(201);
  authToken = regAuth.body.accessToken as string;
  authRefresh = regAuth.body.refreshToken as string;
  authId = regAuth.body.user.id as string;
  testUserIds.push(authId);
});

afterAll(async () => {
  if (testUserIds.length === 0) return;

  // Delete only test-created data — preserves all pre-existing data
  await db.delete(emailsTable).where(inArray(emailsTable.userId, testUserIds));
  await db.delete(refreshTokensTable).where(inArray(refreshTokensTable.userId, testUserIds));
  await db.delete(usersTable).where(inArray(usersTable.id, testUserIds));

  // Close connections so the process can exit cleanly
  await prisma.$disconnect().catch(() => undefined);
  await pool.end().catch(() => undefined);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Health
// ═══════════════════════════════════════════════════════════════════════════════

describe("Health", () => {
  it("GET /api/healthz → 200 with {status:'ok'}", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Security Headers
// ═══════════════════════════════════════════════════════════════════════════════

describe("Security Headers", () => {
  it("has X-Frame-Options header (Helmet)", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["x-frame-options"]).toBeTruthy();
  });

  it("has X-Content-Type-Options: nosniff header (Helmet)", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("does NOT expose X-Powered-By (app.disable)", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Authentication
// ═══════════════════════════════════════════════════════════════════════════════

describe("Authentication", () => {
  it("registers a new user and returns access + refresh tokens", () => {
    // Verified in beforeAll; assert that tokens were captured
    expect(aliceToken).toBeTruthy();
    expect(aliceRefresh).toBeTruthy();
    expect(aliceId).toBeTruthy();
  });

  it("rejects duplicate email registration → 409", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: ALICE_EMAIL, password: PASSWORD, firstName: "Alice2", lastName: "Dup" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBeTruthy();
  });

  it("logs in with correct credentials → 200 + tokens", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALICE_EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(ALICE_EMAIL);
  });

  it("rejects login with wrong password → 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALICE_EMAIL, password: "WrongPassword999!" });
    expect(res.status).toBe(401);
  });

  it("refreshes access token with valid refresh token → 200 + new tokens", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: aliceRefresh });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    // Rotate tokens for subsequent tests
    aliceToken = res.body.accessToken as string;
    aliceRefresh = res.body.refreshToken as string;
  });

  it("rejects invalid/malformed refresh token → 401", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "this.is.not.a.valid.refresh.token" });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Email Operations
// ═══════════════════════════════════════════════════════════════════════════════

describe("Email Operations", () => {
  it("GET /api/emails?folder=inbox → 200 with email list for authenticated user", async () => {
    const res = await request(app)
      .get("/api/emails?folder=inbox")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.emails)).toBe(true);
    expect(typeof res.body.total).toBe("number");
  });

  it("sends email from Alice to Bob; email appears in Alice's Sent and Bob's Inbox", async () => {
    const subject = `Hello Bob — ${RUN_ID}`;

    // Alice sends
    const send = await request(app)
      .post("/api/emails")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({
        subject,
        to: [{ email: BOB_EMAIL, name: "Bob Test" }],
        bodyHtml: "<p>Hi Bob, this is a test email.</p>",
        bodyText: "Hi Bob, this is a test email.",
      });
    expect(send.status).toBe(201);
    expect(send.body.folder).toBe("sent");
    sentEmailId = send.body.id as string;

    // Bob receives it in inbox
    const bobInbox = await request(app)
      .get("/api/emails?folder=inbox")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(bobInbox.status).toBe(200);

    const received = (bobInbox.body.emails as Array<{ subject: string; id: string }>).find(
      (e) => e.subject === subject,
    );
    expect(received, "Bob should have received Alice's email in inbox").toBeTruthy();
    bobReceivedEmailId = received!.id;
  });

  it("Bob replies to Alice's email and reply is linked to the correct thread", async () => {
    expect(bobReceivedEmailId, "bobReceivedEmailId not set — previous test may have failed").toBeTruthy();

    const reply = await request(app)
      .post("/api/emails")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({
        subject: `Re: Hello Bob — ${RUN_ID}`,
        to: [{ email: ALICE_EMAIL, name: "Alice Test" }],
        bodyHtml: "<p>Hi Alice, got your message!</p>",
        bodyText: "Hi Alice, got your message!",
        replyToId: bobReceivedEmailId,
      });
    expect(reply.status).toBe(201);
    expect(reply.body.replyToId).toBe(bobReceivedEmailId);
    expect(reply.body.threadId).toBeTruthy();
    replyEmailId = reply.body.id as string;
  });

  it("creates a draft email (isDraft=true, folder=drafts)", async () => {
    const res = await request(app)
      .post("/api/emails")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({
        subject: `Draft — ${RUN_ID}`,
        to: [{ email: BOB_EMAIL }],
        bodyHtml: "<p>Draft content</p>",
        bodyText: "Draft content",
        isDraft: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.folder).toBe("drafts");
    expect(res.body.isDraft).toBe(true);
    draftEmailId = res.body.id as string;
  });

  it("shows sent email in Sent folder", async () => {
    const res = await request(app)
      .get("/api/emails?folder=sent")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    const found = (res.body.emails as Array<{ id: string }>).find((e) => e.id === sentEmailId);
    expect(found, "Sent email should be in sent folder").toBeTruthy();
  });

  it("moves email to archive", async () => {
    expect(sentEmailId, "sentEmailId not set").toBeTruthy();
    const res = await request(app)
      .patch(`/api/emails/${sentEmailId}/move`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ folder: "archive" });
    expect(res.status).toBe(200);
    expect(res.body.folder).toBe("archive");
  });

  it("restores email from archive back to inbox", async () => {
    const res = await request(app)
      .patch(`/api/emails/${sentEmailId}/move`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ folder: "inbox" });
    expect(res.status).toBe(200);
    expect(res.body.folder).toBe("inbox");
  });

  it("moves email to trash (DELETE /emails/:id) → 204, email appears in trash folder", async () => {
    const del = await request(app)
      .delete(`/api/emails/${sentEmailId}`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(del.status).toBe(204);

    const trash = await request(app)
      .get("/api/emails?folder=trash")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(trash.status).toBe(200);
    const inTrash = (trash.body.emails as Array<{ id: string }>).find((e) => e.id === sentEmailId);
    expect(inTrash, "Trashed email should appear in trash folder").toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Stats
// ═══════════════════════════════════════════════════════════════════════════════

describe("Stats", () => {
  it("GET /api/stats/inbox → 200 with inbox statistics shape", async () => {
    const res = await request(app)
      .get("/api/stats/inbox")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.inboxUnread).toBe("number");
    expect(typeof res.body.totalInbox).toBe("number");
    expect(typeof res.body.draftsCount).toBe("number");
    expect(typeof res.body.sentCount).toBe("number");
    expect(typeof res.body.trashCount).toBe("number");
    expect(typeof res.body.spamCount).toBe("number");
    expect(Array.isArray(res.body.folderCounts)).toBe(true);
    // Verify that our draft is counted
    expect(res.body.draftsCount).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════════

describe("Rate Limiting", () => {
  it("returns 429 after exceeding the configured rate limit", async () => {
    /**
     * We create an isolated mini-app with max=3 per window.
     * This avoids touching the rate-limit store of the main app
     * (which has max=100 for tests) and avoids consuming any real auth quota.
     */
    const miniApp = express();
    const strictLimiter = rateLimit({
      windowMs: 60_000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
    });
    miniApp.use(strictLimiter);
    miniApp.post("/api/auth/login", (_req, res) => res.json({ ok: true }));

    const r1 = await request(miniApp).post("/api/auth/login");
    const r2 = await request(miniApp).post("/api/auth/login");
    const r3 = await request(miniApp).post("/api/auth/login");
    const r4 = await request(miniApp).post("/api/auth/login"); // must be 429

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(429);
  });

  it("rate-limit headers are present on auth responses", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nonexistent@novamail.test", password: "BadPass!" });
    // Should be 401 (wrong creds) with rate-limit headers from the real app
    expect(res.status).toBe(401);
    // express-rate-limit with standardHeaders:true sets RateLimit-* (draft-7) headers
    const hasRateLimitHeaders =
      res.headers["ratelimit-limit"] !== undefined ||
      res.headers["x-ratelimit-limit"] !== undefined;
    expect(hasRateLimitHeaders).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Authorization — protected routes
// ═══════════════════════════════════════════════════════════════════════════════

describe("Authorization", () => {
  it("rejects inbox access with no Authorization header → 401", async () => {
    const res = await request(app).get("/api/emails?folder=inbox");
    expect(res.status).toBe(401);
  });

  it("rejects inbox access with a malformed Bearer token → 401", async () => {
    const res = await request(app)
      .get("/api/emails?folder=inbox")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Email verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("Email Verification", () => {
  it("creates a verification token for a newly registered account", async () => {
    verificationToken = getFakeMailer().getVerifyToken(AUTH_EMAIL) ?? "";
    expect(verificationToken).toBeTruthy();

    const user = await prisma.user.findUnique({ where: { id: authId } });
    expect(user?.emailVerifiedAt).toBeNull();
  });

  it("rejects an invalid verification token", async () => {
    const res = await request(app)
      .post("/api/auth/email-verification/confirm")
      .send({ token: "not-a-valid-verification-token" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  it("resending verification invalidates the previous token", async () => {
    const previousToken = verificationToken;
    const resend = await request(app)
      .post("/api/auth/email-verification/request")
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(resend.status).toBe(200);
    expect(Object.keys(resend.body)).toEqual(["message"]);

    verificationToken = getFakeMailer().getVerifyToken(AUTH_EMAIL) ?? "";
    expect(verificationToken).toBeTruthy();
    expect(verificationToken).not.toBe(previousToken);

    const oldTokenResult = await request(app)
      .post("/api/auth/email-verification/confirm")
      .send({ token: previousToken });
    expect(oldTokenResult.status).toBe(400);
  });

  it("confirms the correct token and only verifies its owner", async () => {
    const bobBefore = await prisma.user.findUnique({ where: { id: bobId } });
    expect(bobBefore?.emailVerifiedAt).toBeNull();

    const res = await request(app)
      .post("/api/auth/email-verification/confirm")
      .send({ token: verificationToken });
    expect(res.status).toBe(200);

    const [verifiedUser, bobAfter] = await Promise.all([
      prisma.user.findUnique({ where: { id: authId } }),
      prisma.user.findUnique({ where: { id: bobId } }),
    ]);
    expect(verifiedUser?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(bobAfter?.emailVerifiedAt).toBeNull();
  });

  it("rejects reuse of a verification token", async () => {
    const res = await request(app)
      .post("/api/auth/email-verification/confirm")
      .send({ token: verificationToken });
    expect(res.status).toBe(400);
  });

  it("rejects an expired verification token", async () => {
    const rawExpiredToken = `expired-verify-${RUN_ID}`;
    const tokenHash = createHash("sha256").update(rawExpiredToken).digest("hex");
    await prisma.emailVerificationToken.create({
      data: {
        userId: authId,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(app)
      .post("/api/auth/email-verification/confirm")
      .send({ token: rawExpiredToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("does not resend verification after the email is verified", async () => {
    const res = await request(app)
      .post("/api/auth/email-verification/request")
      .set("Authorization", `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Session management
// ═══════════════════════════════════════════════════════════════════════════════

describe("Session Management", () => {
  it("creates multiple independently identifiable sessions", async () => {
    const loginA = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "NovaMail Android Test")
      .send({ email: AUTH_EMAIL, password: PASSWORD });
    expect(loginA.status).toBe(200);
    sessionAccessA = loginA.body.accessToken as string;
    sessionRefreshA = loginA.body.refreshToken as string;

    const loginB = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "NovaMail Windows Test")
      .send({ email: AUTH_EMAIL, password: PASSWORD });
    expect(loginB.status).toBe(200);
    sessionAccessB = loginB.body.accessToken as string;
    sessionRefreshB = loginB.body.refreshToken as string;

    expect(sessionRefreshA).not.toBe(sessionRefreshB);
  });

  it("lists only active sessions and never exposes refresh tokens", async () => {
    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${sessionAccessB}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(3);
    expect(res.body.sessions.filter((session: { isCurrent: boolean }) => session.isCurrent)).toHaveLength(1);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(sessionRefreshA);
    expect(serialized).not.toContain(sessionRefreshB);
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("refreshToken");
  });

  it("does not allow a user to revoke another user's session", async () => {
    const bobSessions = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(bobSessions.status).toBe(200);
    const bobSessionId = bobSessions.body.sessions[0]?.id as string;
    expect(bobSessionId).toBeTruthy();

    const res = await request(app)
      .delete(`/api/auth/sessions/${bobSessionId}`)
      .set("Authorization", `Bearer ${sessionAccessB}`);
    expect(res.status).toBe(404);
  });

  it("revokes a selected session and immediately invalidates its access and refresh tokens", async () => {
    const sessionsFromA = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${sessionAccessA}`);
    expect(sessionsFromA.status).toBe(200);
    const sessionAId = sessionsFromA.body.sessions.find(
      (session: { isCurrent: boolean }) => session.isCurrent,
    )?.id as string;
    expect(sessionAId).toBeTruthy();

    const revoke = await request(app)
      .delete(`/api/auth/sessions/${sessionAId}`)
      .set("Authorization", `Bearer ${sessionAccessB}`);
    expect(revoke.status).toBe(204);

    const refresh = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: sessionRefreshA });
    expect(refresh.status).toBe(401);

    const access = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${sessionAccessA}`);
    expect(access.status).toBe(401);
  });

  it("revokes all other sessions while keeping the current session", async () => {
    const res = await request(app)
      .post("/api/auth/sessions/revoke-all")
      .set("Authorization", `Bearer ${sessionAccessB}`)
      .send({ keepCurrentSession: true });
    expect(res.status).toBe(200);
    expect(typeof res.body.revokedCount).toBe("number");

    const remaining = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${sessionAccessB}`);
    expect(remaining.status).toBe(200);
    expect(remaining.body.sessions).toHaveLength(1);
    expect(remaining.body.sessions[0].isCurrent).toBe(true);

    const originalRegistrationRefresh = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: authRefresh });
    expect(originalRegistrationRefresh.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Password recovery
// ═══════════════════════════════════════════════════════════════════════════════

describe("Password Recovery", () => {
  it("returns the same generic response for existing and non-existing accounts", async () => {
    const existing = await request(app)
      .post("/api/auth/password/forgot")
      .send({ email: AUTH_EMAIL });
    const missing = await request(app)
      .post("/api/auth/password/forgot")
      .send({ email: `missing_${RUN_ID}@novamail.test` });

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body).toEqual(missing.body);
    expect(Object.keys(existing.body)).toEqual(["message"]);
    expect(JSON.stringify(existing.body)).not.toMatch(/(?:reset_?token|access_?token|refresh_?token)/i);

    resetToken = getFakeMailer().getResetToken(AUTH_EMAIL) ?? "";
    expect(resetToken).toBeTruthy();
  });

  it("a newer reset request invalidates the previous reset token", async () => {
    const previousToken = resetToken;
    const resend = await request(app)
      .post("/api/auth/password/forgot")
      .send({ email: AUTH_EMAIL });
    expect(resend.status).toBe(200);

    resetToken = getFakeMailer().getResetToken(AUTH_EMAIL) ?? "";
    expect(resetToken).toBeTruthy();
    expect(resetToken).not.toBe(previousToken);

    const old = await request(app)
      .post("/api/auth/password/reset")
      .send({ token: previousToken, newPassword: AUTH_NEW_PASSWORD });
    expect(old.status).toBe(400);
  });

  it("rejects a wrong reset token", async () => {
    const res = await request(app)
      .post("/api/auth/password/reset")
      .send({ token: "wrong-reset-token", newPassword: AUTH_NEW_PASSWORD });
    expect(res.status).toBe(400);
  });

  it("rejects an expired reset token", async () => {
    const rawExpiredToken = `expired-reset-${RUN_ID}`;
    const tokenHash = createHash("sha256").update(rawExpiredToken).digest("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: authId,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const res = await request(app)
      .post("/api/auth/password/reset")
      .send({ token: rawExpiredToken, newPassword: AUTH_NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("resets the password and revokes every old session", async () => {
    const res = await request(app)
      .post("/api/auth/password/reset")
      .send({ token: resetToken, newPassword: AUTH_NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["message"]);
    expect(JSON.stringify(res.body)).not.toContain(resetToken);

    const oldRefresh = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: sessionRefreshB });
    expect(oldRefresh.status).toBe(401);

    const oldAccess = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${sessionAccessB}`);
    expect(oldAccess.status).toBe(401);
  });

  it("rejects reuse of a reset token", async () => {
    const res = await request(app)
      .post("/api/auth/password/reset")
      .send({ token: resetToken, newPassword: "AnotherPass_789!" });
    expect(res.status).toBe(400);
  });

  it("rejects the old password and accepts the new password", async () => {
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: AUTH_EMAIL, password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: AUTH_EMAIL, password: AUTH_NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.accessToken).toBeTruthy();
    expect(newLogin.body.refreshToken).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Phase-2 security and rate limiting
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase-2 Security", () => {
  it("protects session listing without an access token", async () => {
    const res = await request(app).get("/api/auth/sessions");
    expect(res.status).toBe(401);
  });

  it("the email-action limiter returns 429 in an isolated test app", async () => {
    const miniApp = express();
    miniApp.use(express.json());
    miniApp.post(
      "/forgot",
      createEmailActionRateLimit({ max: 3, windowMs: 60_000 }),
      (_req, res) => res.json({ ok: true }),
    );

    const responses = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(
        await request(miniApp)
          .post("/forgot")
          .send({ email: `rate_${RUN_ID}@novamail.test` }),
      );
    }

    expect(responses.slice(0, 3).every((response) => response.status === 200)).toBe(true);
    expect(responses[3]?.status).toBe(429);
  });
});


// ============================================================================
// IDOR / Object Ownership Security
// ============================================================================

describe("IDOR / Object Ownership", () => {
  it("does not allow Bob to read Alice's email by id", async () => {
    const res = await request(app)
      .get(`/api/emails/${sentEmailId}`)
      .set("Authorization", `Bearer ${bobToken}`);

    expect(res.status).toBe(404);
  });

  it("does not allow Bob to star Alice's email", async () => {
    const res = await request(app)
      .patch(`/api/emails/${sentEmailId}/star`)
      .set("Authorization", `Bearer ${bobToken}`);

    expect(res.status).toBe(404);
  });

  it("does not allow Bob to mark Alice's email as read", async () => {
    const res = await request(app)
      .patch(`/api/emails/${sentEmailId}/read`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ isRead: true });

    expect(res.status).toBe(404);
  });

  it("does not allow Bob to move Alice's email", async () => {
    const res = await request(app)
      .patch(`/api/emails/${sentEmailId}/move`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ folder: "archive" });

    expect(res.status).toBe(404);
  });

  it("does not allow Bob to permanently delete Alice's email", async () => {
    const res = await request(app)
      .delete(`/api/emails/${sentEmailId}/permanent`)
      .set("Authorization", `Bearer ${bobToken}`);

    expect(res.status).toBe(404);

    const aliceCanStillRead = await request(app)
      .get(`/api/emails/${sentEmailId}`)
      .set("Authorization", `Bearer ${aliceToken}`);

    expect(aliceCanStillRead.status).toBe(200);
  });

  it("does not allow Bob to modify or remove Alice's custom folder", async () => {
    const created = await request(app)
      .post("/api/folders")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({
        name: `Alice Private ${RUN_ID}`,
        color: "#123456",
      });

    expect(created.status).toBe(201);
    const folderId = created.body.id as string;

    const bobPatch = await request(app)
      .patch(`/api/folders/${folderId}`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({
        name: "Bob Attempt",
        color: "#654321",
      });

    expect(bobPatch.status).toBe(404);

    await request(app)
      .delete(`/api/folders/${folderId}`)
      .set("Authorization", `Bearer ${bobToken}`);

    const aliceFolders = await request(app)
      .get("/api/folders")
      .set("Authorization", `Bearer ${aliceToken}`);

    expect(aliceFolders.status).toBe(200);
    expect(
      (aliceFolders.body as Array<{ id: string }>).some(
        (folder) => folder.id === folderId,
      ),
    ).toBe(true);

    await request(app)
      .delete(`/api/folders/${folderId}`)
      .set("Authorization", `Bearer ${aliceToken}`);
  });
});


describe('Notifications HTTP lifecycle', () => {
  it('registers, rotates, transfers ownership, revokes, and isolates devices', async () => {
    const token = `push-${RUN_ID}-shared`;
    const first = await request(app).post('/api/notifications/devices').set('Authorization', `Bearer ${aliceToken}`).send({ platform: 'web', pushToken: token });
    expect(first.status).toBe(201);
    expect(first.body.isActive).toBe(true);
    const aliceDevices = await request(app).get('/api/notifications/devices').set('Authorization', `Bearer ${aliceToken}`);
    expect(aliceDevices.status).toBe(200);
    const deviceId = aliceDevices.body.devices.find((device: { isActive: boolean }) => device.isActive)?.id as string;
    expect(deviceId).toBeTruthy();

    const rotated = await request(app).post('/api/notifications/devices').set('Authorization', `Bearer ${aliceToken}`).send({ platform: 'android', pushToken: `${token}-rotated` });
    expect(rotated.status).toBe(201);
    const transferred = await request(app).post('/api/notifications/devices').set('Authorization', `Bearer ${bobToken}`).send({ platform: 'web', pushToken: token });
    expect(transferred.status).toBe(201);
    const afterTransfer = await request(app).get('/api/notifications/devices').set('Authorization', `Bearer ${aliceToken}`);
    expect(afterTransfer.body.devices.some((device: { id: string; isActive: boolean }) => device.isActive && device.id === deviceId)).toBe(false);

    const forbiddenDelete = await request(app).delete(`/api/notifications/devices/${deviceId}`).set('Authorization', `Bearer ${bobToken}`);
    expect(forbiddenDelete.status).toBe(204);
    const revoke = await request(app).delete(`/api/notifications/devices/${deviceId}`).set('Authorization', `Bearer ${aliceToken}`);
    expect(revoke.status).toBe(204);
  });

  it('validates preferences and keeps them user-scoped', async () => {
    const update = await request(app).patch('/api/notifications/preferences').set('Authorization', `Bearer ${aliceToken}`).send({ pushEnabled: false, showPreview: true });
    expect(update.status).toBe(200);
    expect(update.body.pushEnabled).toBe(false);
    const bob = await request(app).get('/api/notifications/preferences').set('Authorization', `Bearer ${bobToken}`);
    expect(bob.status).toBe(200);
    expect(bob.body.pushEnabled).not.toBe(false);
    const invalid = await request(app).patch('/api/notifications/preferences').set('Authorization', `Bearer ${aliceToken}`).send({ pushEnabled: 'yes' });
    expect(invalid.status).toBe(400);
  });

  it('exposes only the current user delivery records after FakePushProvider delivery', async () => {
    const { deliverNotification, FakePushProvider } = await import('../modules/notifications/notifications.service.js');
    process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const device = await request(app).post('/api/notifications/devices').set('Authorization', `Bearer ${aliceToken}`).send({ platform: 'web', pushToken: `push-${RUN_ID}-delivery` });
    expect(device.status).toBe(201);
    await deliverNotification(new FakePushProvider(), { eventId: `event-${RUN_ID}`, eventType: 'email.created', userId: aliceId, emailId: `email-${RUN_ID}`, subject: 'test', bodyPreview: 'secret' });
    const own = await request(app).get('/api/notifications/delivery-records').set('Authorization', `Bearer ${aliceToken}`);
    const other = await request(app).get('/api/notifications/delivery-records').set('Authorization', `Bearer ${bobToken}`);
    expect(own.status).toBe(200);
    expect(own.body.records.some((record: { eventId: string }) => record.eventId === `event-${RUN_ID}`)).toBe(true);
    expect(other.body.records.some((record: { eventId: string }) => record.eventId === `event-${RUN_ID}`)).toBe(false);
  });
});


describe('Search Unicode, filters, and cursor isolation', () => {
  it('searches Arabic, Urdu, CJK, and emoji text with safe date validation', async () => {
    const draft = await request(app).post('/api/emails').set('Authorization', `Bearer ${aliceToken}`).send({ to: [{ email: BOB_EMAIL }], subject: 'العربية اردو 日本語 中文 🚀', bodyText: 'Unicode search fixture', isDraft: true });
    expect(draft.status).toBe(201);
    const arabic = await request(app).get('/api/emails?folder=drafts&search=العربية').set('Authorization', `Bearer ${aliceToken}`);
    const cjk = await request(app).get('/api/emails?folder=drafts&search=日本語').set('Authorization', `Bearer ${aliceToken}`);
    expect(arabic.status).toBe(200);
    expect(cjk.status).toBe(200);
    expect(arabic.body.emails.some((email: { subject: string }) => email.subject.includes('العربية'))).toBe(true);
    expect(cjk.body.emails.some((email: { subject: string }) => email.subject.includes('日本語'))).toBe(true);
    const invalid = await request(app).get('/api/emails?dateFrom=not-a-date').set('Authorization', `Bearer ${aliceToken}`);
    expect(invalid.status).toBe(400);
  });

  it('keeps search tenant-scoped and cursor pages tie-safe', async () => {
    const first = await request(app).get('/api/emails?folder=drafts&search=العربية&limit=1').set('Authorization', `Bearer ${aliceToken}`);
    expect(first.status).toBe(200);
    const bob = await request(app).get('/api/emails?folder=drafts&search=العربية').set('Authorization', `Bearer ${bobToken}`);
    expect(bob.status).toBe(200);
    expect(bob.body.emails.some((email: { subject: string }) => email.subject.includes('العربية'))).toBe(false);
    if (first.body.nextCursor) {
      const second = await request(app).get(`/api/emails?folder=drafts&search=العربية&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`).set('Authorization', `Bearer ${aliceToken}`);
      expect(second.status).toBe(200);
      const firstIds = new Set(first.body.emails.map((email: { id: string }) => email.id));
      expect(second.body.emails.some((email: { id: string }) => firstIds.has(email.id))).toBe(false);
    }
  });
});
