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

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import request from "supertest";
import express from "express";
import rateLimit from "express-rate-limit";
import { createEmailActionRateLimit } from "../middlewares/rate-limit.js";
import { getFakeMailer } from "../lib/mailer.js";

import app from "../app.js";
import { db, emailsTable, gmailConnectionsTable, pool, refreshTokensTable, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { prisma } from "../lib/prisma.js";
import { encryptGmailToken } from "../modules/gmail/gmail.crypto.js";
import { syncGmail, syncGmailFromPushNotification } from "../modules/gmail/gmail.service.js";
import { reconcileOpenFollowUps } from "../modules/productivity/productivity.service.js";

// ── Unique identifiers for this test run ──────────────────────────────────────
const RUN_ID = `r${Date.now()}`;
const ALICE_EMAIL = `alice_${RUN_ID}@novamail.test`;
const BOB_EMAIL = `bob_${RUN_ID}@novamail.test`;
const PASSWORD = "TestPass_123!";
const AUTH_EMAIL = `auth_${RUN_ID}@novamail.test`;
const AUTH_NEW_PASSWORD = "NewTestPass_456!";

// ── Shared state populated by tests in order ──────────────────────────────────
const testUserIds: string[] = [];
const testGmailConnectionIds: string[] = [];

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

  const gmailFixtures = [
    { userId: aliceId, externalAccountId: `gmail-a1-${RUN_ID}`, email: `alice.one.${RUN_ID}@gmail.test` },
    { userId: aliceId, externalAccountId: `gmail-a2-${RUN_ID}`, email: `alice.two.${RUN_ID}@gmail.test` },
    { userId: bobId, externalAccountId: `gmail-b1-${RUN_ID}`, email: `bob.one.${RUN_ID}@gmail.test` },
  ];
  for (const fixture of gmailFixtures) {
    const [connection] = await db.insert(gmailConnectionsTable).values({
      userId: fixture.userId,
      provider: "gmail",
      externalAccountId: fixture.externalAccountId,
      emailAddress: fixture.email,
      gmailEmail: fixture.email,
      encryptedAccessToken: `fake-access-${fixture.externalAccountId}`,
      encryptedRefreshToken: `fake-refresh-${fixture.externalAccountId}`,
      syncStatus: "connected",
    }).returning({ id: gmailConnectionsTable.id });
    testGmailConnectionIds.push(connection.id);
  }
});

afterAll(async () => {
  if (testUserIds.length === 0) return;

  // Delete only test-created data — preserves all pre-existing data
  if (testGmailConnectionIds.length > 0) await db.delete(gmailConnectionsTable).where(inArray(gmailConnectionsTable.id, testGmailConnectionIds));
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
    await request(app).patch('/api/notifications/preferences').set('Authorization', `Bearer ${aliceToken}`).send({ pushEnabled: true, showPreview: false });
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


describe('Gmail multi-account safety without external OAuth', () => {
  it('keeps account lists user-scoped and reports not configured without credentials', async () => {
    const alice = await request(app).get('/api/gmail/accounts').set('Authorization', `Bearer ${aliceToken}`);
    const bob = await request(app).get('/api/gmail/accounts').set('Authorization', `Bearer ${bobToken}`);
    expect(alice.status).toBe(200);
    expect(bob.status).toBe(200);
    expect(alice.body.accounts).toEqual(expect.any(Array));
    expect(bob.body.accounts).toEqual(expect.any(Array));
    expect(JSON.stringify(bob.body.accounts)).not.toContain(ALICE_EMAIL);
    const status = await request(app).get('/api/gmail/status').set('Authorization', `Bearer ${aliceToken}`);
    expect(status.status).toBe(200);
    expect(status.body.configured).toBe(false);
  });

  it('isolates two accounts for Alice from Bob and enforces global external-account ownership', async () => {
    const alice = await request(app).get('/api/gmail/accounts').set('Authorization', `Bearer ${aliceToken}`);
    const bob = await request(app).get('/api/gmail/accounts').set('Authorization', `Bearer ${bobToken}`);
    expect(alice.body.accounts.map((account: { emailAddress: string }) => account.emailAddress)).toEqual(expect.arrayContaining([`alice.one.${RUN_ID}@gmail.test`, `alice.two.${RUN_ID}@gmail.test`]));
    expect(alice.body.accounts).toHaveLength(2);
    expect(bob.body.accounts.map((account: { emailAddress: string }) => account.emailAddress)).toEqual([`bob.one.${RUN_ID}@gmail.test`]);
    expect(JSON.stringify(bob.body.accounts)).not.toContain(`alice.one.${RUN_ID}`);
    let duplicateInserted = false;
    try {
      await db.insert(gmailConnectionsTable).values({ userId: bobId, provider: "gmail", externalAccountId: `gmail-a1-${RUN_ID}`, emailAddress: `forged.${RUN_ID}@gmail.test`, gmailEmail: `forged.${RUN_ID}@gmail.test`, encryptedAccessToken: "fake", syncStatus: "connected" });
      duplicateInserted = true;
    } catch {
      duplicateInserted = false;
    }
    expect(duplicateInserted).toBe(false);
  });

  it('runs concurrent syncGmail against a Fake provider, routes Pub/Sub by mailbox, and never crosses accounts', async () => {
    const previousGmailEncryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    if (!previousGmailEncryptionKey) process.env.GMAIL_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const fakeEmail = `alice.sync.${RUN_ID}@gmail.test`;
    const [connection] = await db.insert(gmailConnectionsTable).values({
      userId: aliceId,
      provider: 'gmail',
      externalAccountId: `gmail-sync-${RUN_ID}`,
      emailAddress: fakeEmail,
      gmailEmail: fakeEmail,
      encryptedAccessToken: encryptGmailToken(`access-${RUN_ID}`),
      encryptedRefreshToken: encryptGmailToken(`refresh-${RUN_ID}`),
      syncStatus: 'connected',
      tokenExpiry: null,
      lastHistoryId: null,
    }).returning({ id: gmailConnectionsTable.id });
    testGmailConnectionIds.push(connection.id);
    const bobFakeEmail = `bob.sync.${RUN_ID}@gmail.test`;
    const [bobConnection] = await db.insert(gmailConnectionsTable).values({
      userId: bobId,
      provider: 'gmail',
      externalAccountId: `gmail-bob-sync-${RUN_ID}`,
      emailAddress: bobFakeEmail,
      gmailEmail: bobFakeEmail,
      encryptedAccessToken: encryptGmailToken(`bob-access-${RUN_ID}`),
      encryptedRefreshToken: encryptGmailToken(`bob-refresh-${RUN_ID}`),
      syncStatus: 'connected',
      tokenExpiry: null,
      lastHistoryId: null,
    }).returning({ id: gmailConnectionsTable.id });
    testGmailConnectionIds.push(bobConnection.id);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/messages')) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return new Response(JSON.stringify({ messages: [], resultSizeEstimate: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (pathname.endsWith('/history')) {
        return new Response(JSON.stringify({ historyId: `history-${RUN_ID}-next`, history: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (pathname.endsWith('/profile')) {
        return new Response(JSON.stringify({ emailAddress: fakeEmail, historyId: `history-${RUN_ID}` }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected Fake Gmail path: ${pathname}`);
    });

    try {
      const results = await Promise.allSettled([
        syncGmail(aliceId, connection.id),
        syncGmail(aliceId, connection.id),
      ]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0].value.email).toBe(fakeEmail);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as { statusCode?: number }).statusCode).toBe(409);

      const routed = await syncGmailFromPushNotification(fakeEmail);
      expect(routed).toEqual({ matched: true, imported: 0 });
      expect(fetchSpy.mock.calls.every(([input]) => String(input).includes('gmail.googleapis.com/gmail/v1/users/me'))).toBe(true);

      const bobRouted = await syncGmailFromPushNotification(bobFakeEmail);
      expect(bobRouted.matched).toBe(true);
      const unknownRouted = await syncGmailFromPushNotification(`unknown.${RUN_ID}@gmail.test`);
      expect(unknownRouted).toEqual({ matched: false, imported: 0 });
    } finally {
      fetchSpy.mockRestore();
      if (previousGmailEncryptionKey === undefined) delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
      else process.env.GMAIL_TOKEN_ENCRYPTION_KEY = previousGmailEncryptionKey;
    }
  });

  it('rejects unauthenticated Pub/Sub pushes before account routing', async () => {
    const response = await request(app).post('/api/gmail/push').send({ message: { data: Buffer.from(JSON.stringify({ emailAddress: ALICE_EMAIL })).toString('base64') } });
    expect(response.status).toBe(401);
  });
});


describe("Productivity workspace and follow-up lifecycle", () => {
  it("returns explainable smart inbox data and the unified workspace snapshot", async () => {
    const response = await request(app)
      .get("/api/productivity/workspace?q=unread from:alice")
      .set("Authorization", `Bearer ${aliceToken}`);

    expect(response.status).toBe(200);
    expect(response.body.smartInbox.queryPlan.filters).toEqual(expect.arrayContaining(["unread", expect.stringContaining("from:")]));
    expect(Array.isArray(response.body.smartInbox.emails)).toBe(true);
    expect(Array.isArray(response.body.overdueTasks)).toBe(true);
    expect(Array.isArray(response.body.upcomingEvents)).toBe(true);
    expect(Array.isArray(response.body.drafts)).toBe(true);
    expect(Array.isArray(response.body.followUps)).toBe(true);
    expect(typeof response.body.generatedAt).toBe("string");
  });

  it("persists follow-up reminders and prevents cross-user access", async () => {
    expect(sentEmailId).toBeTruthy();
    const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const created = await request(app)
      .post("/api/productivity/follow-ups")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ emailId: sentEmailId, remindAt, note: "Review before the next work block" });

    expect(created.status).toBe(201);
    expect(created.body.emailId).toBe(sentEmailId);

    const own = await request(app)
      .get("/api/productivity/follow-ups")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(own.status).toBe(200);
    expect(own.body.followUps.some((item: { emailId: string }) => item.emailId === sentEmailId)).toBe(true);

    const other = await request(app)
      .get("/api/productivity/follow-ups")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(other.status).toBe(200);
    expect(other.body.followUps.some((item: { emailId: string }) => item.emailId === sentEmailId)).toBe(false);

    const forged = await request(app)
      .post("/api/productivity/follow-ups")
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ emailId: sentEmailId, remindAt });
    expect(forged.status).toBe(404);

    const followUp = own.body.followUps.find((item: { emailId: string }) => item.emailId === sentEmailId) as { id: string };
    const completed = await request(app)
      .patch(`/api/productivity/follow-ups/${followUp.id}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ status: "completed" });
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("completed");
  });
});


describe("Productivity AI insights contract", () => {
  it("returns NOT_CONFIGURED behavior instead of fake AI output when provider credentials are absent", async () => {
    expect(sentEmailId).toBeTruthy();
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const response = await request(app)
        .post(`/api/ai/insights/${sentEmailId}`)
        .set("Authorization", `Bearer ${aliceToken}`);
      expect(response.status).toBe(503);
      expect(response.body.error).toBe("AI service unavailable");
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous;
    }
  });

  it("does not reveal another user's message through AI insights", async () => {
    expect(sentEmailId).toBeTruthy();
    const response = await request(app)
      .post(`/api/ai/insights/${sentEmailId}`)
      .set("Authorization", `Bearer ${bobToken}`);
    expect(response.status).toBe(404);
  });
});


describe("Productivity global search filters", () => {
  it("applies sender, date, attachment, priority, task, and folder filters through HTTP", async () => {
    expect(sentEmailId).toBeTruthy();
    const linkedTask = await request(app)
      .post("/api/productivity/tasks")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ title: "Filter fixture task", emailId: sentEmailId, priority: "high" });
    expect(linkedTask.status).toBe(201);

    const response = await request(app)
      .get("/api/productivity/workspace?q=from:alice after:2020-01-01 before:2099-12-31 attachments priority:high task folder:inbox")
      .set("Authorization", `Bearer ${aliceToken}`);

    expect(response.status).toBe(200);
    expect(response.body.smartInbox.queryPlan.filters).toEqual(expect.arrayContaining([
      "has_attachment",
      "has_task",
      "priority:high",
      "folder:inbox",
      "after:2020-01-01",
      "before:2099-12-31",
      expect.stringContaining("from:"),
    ]));
    expect(response.body.smartInbox.emails.every((item: { email: { id: string } }) => item.email.id === sentEmailId)).toBe(true);
  });

  it("keeps global folder search user-scoped and rejects invalid date values without broadening the query", async () => {
    const own = await request(app)
      .get("/api/productivity/workspace?q=folder:sent")
      .set("Authorization", `Bearer ${aliceToken}`);
    const other = await request(app)
      .get("/api/productivity/workspace?q=folder:sent")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(own.status).toBe(200);
    expect(other.status).toBe(200);
    expect(own.body.smartInbox.emails.some((item: { email: { userId?: string } }) => item.email.userId === bobId)).toBe(false);
    expect(other.body.smartInbox.emails.some((item: { email: { userId?: string } }) => item.email.userId === aliceId)).toBe(false);

    const invalidDate = await request(app)
      .get("/api/productivity/workspace?q=after:not-a-date")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(invalidDate.status).toBe(200);
    expect(invalidDate.body.smartInbox.queryPlan.filters).not.toContain("after:not-a-date");
  });
});


describe("Workspace preferences and waiting-for-reply contract", () => {
  it("persists layout preferences in PostgreSQL and keeps them isolated per user", async () => {
    const initial = await request(app)
      .get("/api/productivity/preferences")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(initial.status).toBe(200);
    expect(initial.body.userId).toBe(aliceId);

    const update = await request(app)
      .patch("/api/productivity/preferences")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({
        inboxDensity: "compact",
        inboxLayout: "split",
        visibleSections: ["important", "follow_ups", "tasks"],
        visibleColumns: ["sender", "subject", "priority"],
        accentColor: "violet",
        theme: "dark",
        keyboardShortcuts: { search: "/", compose: "c" },
        savedSearches: ["from:alice deadline"],
      });
    expect(update.status).toBe(200);
    expect(update.body.inboxDensity).toBe("compact");
    expect(update.body.inboxLayout).toBe("split");
    expect(update.body.visibleColumns).toEqual(["sender", "subject", "priority"]);
    expect(update.body.savedSearches).toContain("from:alice deadline");

    const persisted = await request(app)
      .get("/api/productivity/preferences")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(persisted.status).toBe(200);
    expect(persisted.body.accentColor).toBe("violet");
    expect(persisted.body.theme).toBe("dark");

    const bob = await request(app)
      .get("/api/productivity/preferences")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(bob.status).toBe(200);
    expect(bob.body.userId).toBe(bobId);
    expect(bob.body.accentColor).not.toBe("violet");
    expect(bob.body.savedSearches).not.toContain("from:alice deadline");
  });

  it("returns waiting-for-reply state and clears it on completion", async () => {
    expect(sentEmailId).toBeTruthy();
    const remindAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const created = await request(app)
      .post("/api/productivity/follow-ups")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ emailId: sentEmailId, remindAt, waitingForReply: true });
    expect(created.status).toBe(201);
    expect(created.body.waitingForReply).toBe(true);

    const listed = await request(app)
      .get("/api/productivity/follow-ups")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(listed.status).toBe(200);
    const item = listed.body.followUps.find((followUp: { emailId: string }) => followUp.emailId === sentEmailId) as { id: string; waitingForReply: boolean };
    expect(item.waitingForReply).toBe(true);

    const completed = await request(app)
      .patch(`/api/productivity/follow-ups/${item.id}`)
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ status: "completed", waitingForReply: false });
    expect(completed.status).toBe(200);
    expect(completed.body.waitingForReply).toBe(false);
  });
});


describe("Follow-up scheduled reconciliation", () => {
  it("closes one waiting follow-up after a persisted incoming reply and is idempotent", async () => {
    expect(sentEmailId).toBeTruthy();
    const reminder = await request(app)
      .post("/api/productivity/follow-ups")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ emailId: sentEmailId, remindAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), waitingForReply: true, note: `scheduled reconciliation ${RUN_ID}` });
    expect(reminder.status).toBe(201);
    const followUpId = reminder.body.id as string;

    const incomingReplyId = crypto.randomUUID();
    await db.insert(emailsTable).values({
      id: incomingReplyId,
      userId: aliceId,
      fromEmail: BOB_EMAIL,
      toAddresses: [{ email: ALICE_EMAIL }],
      subject: `Re: scheduled reconciliation ${RUN_ID}`,
      bodyText: "A persisted reply for the scheduler reconciliation test.",
      bodyHtml: "<p>A persisted reply for the scheduler reconciliation test.</p>",
      folder: "inbox",
      isDraft: false,
      status: "sent",
      replyToId: sentEmailId,
      createdAt: new Date(Date.now() + 1),
    });

    const first = await reconcileOpenFollowUps(`test:follow-up-reconciliation:${RUN_ID}`);
    expect(first).toMatchObject({ locked: true, inspected: expect.any(Number), closed: 1 });
    const second = await reconcileOpenFollowUps(`test:follow-up-reconciliation:${RUN_ID}`);
    expect(second).toMatchObject({ locked: true, closed: 0 });

    const listed = await request(app).get("/api/productivity/follow-ups").set("Authorization", `Bearer ${aliceToken}`);
    expect(listed.status).toBe(200);
    const closed = listed.body.followUps.find((item: { id: string }) => item.id === followUpId);
    expect(closed).toMatchObject({ status: "completed", waitingForReply: false });
  });
});

describe("Unified workspace v0.9 account, privacy, focus, and reply intelligence", () => {
  it("lists only owned accounts and persists the active account context", async () => {
    const aliceAccounts = await request(app).get("/api/productivity/accounts").set("Authorization", `Bearer ${aliceToken}`);
    expect(aliceAccounts.status).toBe(200);
    expect(aliceAccounts.body.accounts.map((account: { id: string }) => account.id)).toEqual(expect.arrayContaining(["local", testGmailConnectionIds[0], testGmailConnectionIds[1]]));
    expect(aliceAccounts.body.accounts.every((account: { id: string; emailAddress: string }) => account.emailAddress.endsWith("@gmail.test") || account.id === "local")).toBe(true);

    const bobAccounts = await request(app).get("/api/productivity/accounts").set("Authorization", `Bearer ${bobToken}`);
    expect(bobAccounts.status).toBe(200);
    expect(bobAccounts.body.accounts.map((account: { id: string }) => account.id)).not.toEqual(expect.arrayContaining(testGmailConnectionIds.filter((id) => id !== testGmailConnectionIds[2])));

    const selected = await request(app).patch("/api/productivity/accounts/active").set("Authorization", `Bearer ${aliceToken}`).send({ accountId: testGmailConnectionIds[0] });
    expect(selected.status).toBe(200);
    expect(selected.body.activeAccountId).toBe(testGmailConnectionIds[0]);
    const preferences = await request(app).get("/api/productivity/preferences").set("Authorization", `Bearer ${aliceToken}`);
    expect(preferences.body.activeAccountId).toBe(testGmailConnectionIds[0]);

    const forged = await request(app).patch("/api/productivity/accounts/active").set("Authorization", `Bearer ${bobToken}`).send({ accountId: testGmailConnectionIds[0] });
    expect(forged.status).toBe(404);
    await request(app).patch("/api/productivity/accounts/active").set("Authorization", `Bearer ${aliceToken}`).send({ accountId: "all" });
  });

  it("keeps Workspace and Inbox data isolated by owned account", async () => {
    const accountA = testGmailConnectionIds[0]!;
    const accountB = testGmailConnectionIds[1]!;
    const draftA = await request(app).post("/api/emails").set("Authorization", `Bearer ${aliceToken}`).send({ accountId: accountA, subject: `Account A workspace ${RUN_ID}`, to: [{ email: BOB_EMAIL }], bodyHtml: "<p>A</p>", bodyText: "A", isDraft: true });
    const draftB = await request(app).post("/api/emails").set("Authorization", `Bearer ${aliceToken}`).send({ accountId: accountB, subject: `Account B workspace ${RUN_ID}`, to: [{ email: BOB_EMAIL }], bodyHtml: "<p>B</p>", bodyText: "B", isDraft: true });
    expect(draftA.status).toBe(201);
    expect(draftB.status).toBe(201);

    const onlyA = await request(app).get(`/api/productivity/workspace?accountId=${accountA}&focusMode=work`).set("Authorization", `Bearer ${aliceToken}`);
    expect(onlyA.status).toBe(200);
    expect(onlyA.body.accountId).toBe(accountA);
    expect(onlyA.body.drafts.map((draft: { id: string }) => draft.id)).toContain(draftA.body.id);
    expect(onlyA.body.drafts.map((draft: { id: string }) => draft.id)).not.toContain(draftB.body.id);

    const inboxA = await request(app).get(`/api/emails?folder=drafts&accountId=${accountA}`).set("Authorization", `Bearer ${aliceToken}`);
    expect(inboxA.status).toBe(200);
    expect(inboxA.body.emails.some((email: { id: string }) => email.id === draftA.body.id)).toBe(true);
    expect(inboxA.body.emails.some((email: { id: string }) => email.id === draftB.body.id)).toBe(false);
    const bobCannotUseAliceAccount = await request(app).get(`/api/emails?accountId=${accountA}`).set("Authorization", `Bearer ${bobToken}`);
    expect(bobCannotUseAliceAccount.status).toBe(404);
  });

  it("persists focus mode and exposes Privacy Center state without false provider claims", async () => {
    const focus = await request(app).patch("/api/productivity/focus").set("Authorization", `Bearer ${aliceToken}`).send({ mode: "follow_up" });
    expect(focus.status).toBe(200);
    expect(focus.body.mode).toBe("follow_up");
    const workspace = await request(app).get("/api/productivity/workspace").set("Authorization", `Bearer ${aliceToken}`);
    expect(workspace.body.focusMode).toBe("follow_up");

    const privacy = await request(app).get("/api/privacy/center").set("Authorization", `Bearer ${aliceToken}`);
    expect(privacy.status).toBe(200);
    expect(typeof privacy.body.controls.externalImagesBlocked).toBe("boolean");
    expect(privacy.body.encryption.status).toBe("transport_only");
    expect(privacy.body.providers.outlook).toBe("not_configured");
    expect(Array.isArray(privacy.body.sessions)).toBe(true);
    expect(Array.isArray(privacy.body.accessLog)).toBe(true);

    const updated = await request(app).patch("/api/privacy/center").set("Authorization", `Bearer ${aliceToken}`).send({ externalImagesBlocked: false, trackingPixelsBlocked: true });
    expect(updated.status).toBe(200);
    expect(updated.body.controls).toEqual({ externalImagesBlocked: false, trackingPixelsBlocked: true });
    const bobPrivacy = await request(app).get("/api/privacy/center").set("Authorization", `Bearer ${bobToken}`);
    expect(bobPrivacy.status).toBe(200);
    expect(bobPrivacy.body.controls.externalImagesBlocked).toBe(true);
    await request(app).patch("/api/productivity/focus").set("Authorization", `Bearer ${aliceToken}`).send({ mode: "focus" });
  });

  it("closes an open follow-up only after a real reply is delivered through the email route", async () => {
    const reminder = await request(app).post("/api/productivity/follow-ups").set("Authorization", `Bearer ${aliceToken}`).send({ emailId: sentEmailId, remindAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), waitingForReply: true, note: `reply intelligence ${RUN_ID}` });
    expect(reminder.status).toBe(201);
    const followUpId = reminder.body.id as string;
    const reply = await request(app).post("/api/emails").set("Authorization", `Bearer ${bobToken}`).send({ subject: `Re: Hello Bob — ${RUN_ID}`, to: [{ email: ALICE_EMAIL }], bodyHtml: "<p>Real reply</p>", bodyText: "Real reply", replyToId: bobReceivedEmailId });
    expect(reply.status).toBe(201);

    const completed = await request(app).get("/api/productivity/follow-ups").set("Authorization", `Bearer ${aliceToken}`);
    expect(completed.status).toBe(200);
    const closed = completed.body.followUps.find((item: { id: string }) => item.id === followUpId);
    expect(closed?.status).toBe("completed");
    expect(closed?.waitingForReply).toBe(false);
  });
});
