/**
 * NovaMail authentication service.
 *
 * Includes registration/login, refresh-token rotation, logout, one-time email
 * verification, password recovery, and user session management.
 */

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { User } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, comparePassword, hashToken, compareToken } from "../../lib/hash.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshExpiryDate,
  type JwtPayload,
} from "../../lib/jwt.js";
import { getMailer } from "../../lib/mailer.js";
import { logger } from "../../lib/logger.js";
import {
  createTwoFactorLoginChallenge,
  verifyTwoFactorLoginChallenge,
} from "./two-factor.service.js";

function apiError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

function hashSecureToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseDeviceName(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS Device";
  if (/Android/i.test(userAgent)) return "Android Device";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Mac";
  if (/Linux/i.test(userAgent)) return "Linux";
  if (/PostmanRuntime|supertest|undici|node-fetch/i.test(userAgent)) return "API Client";
  return "Unknown Device";
}

function hashIpAddress(ip: string): string {
  const secret =
    process.env["SESSION_IP_HASH_SECRET"] ??
    process.env["JWT_ACCESS_SECRET"] ??
    "novamail-session-ip-dev-only";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 20);
}

export function toPublicUser(user: User) {
  // Never expose password hashes, encrypted TOTP secrets, or recovery-code hashes.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    passwordHash,
    twoFactorSecretEncrypted,
    twoFactorRecoveryCodeHashes,
    ...publicUser
  } = user;
  return publicUser;
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface SessionContext {
  userAgent?: string | null;
  ip?: string | null;
}

type UserIdentity = Pick<User, "id" | "email" | "role">;

function sessionMetadata(session?: SessionContext) {
  const userAgent = session?.userAgent ?? null;
  return {
    userAgent,
    deviceName: parseDeviceName(userAgent),
    ipHash: session?.ip ? hashIpAddress(session.ip) : null,
  };
}

async function createTokenPair(
  user: UserIdentity,
  session?: SessionContext,
): Promise<{ accessToken: string; refreshToken: string }> {
  const sessionId = randomUUID();
  const refreshToken = signRefreshToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: sessionId,
  });
  const tokenHash = await hashToken(refreshToken);
  const metadata = sessionMetadata(session);

  await prisma.refreshToken.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash,
      expiresAt: getRefreshExpiryDate(),
      ...metadata,
      lastUsedAt: new Date(),
    },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: sessionId,
  });

  return { accessToken, refreshToken };
}

export async function registerUser(dto: RegisterDto, session?: SessionContext) {
  const email = dto.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) throw apiError("Email already registered", 409);

  const passwordHash = await hashPassword(dto.password);
  let user: User;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        displayName: `${dto.firstName.trim()} ${dto.lastName.trim()}`,
      },
    });
  } catch (err: unknown) {
    const prismaError = err as { code?: string };
    if (prismaError.code === "P2002") throw apiError("Email already registered", 409);
    throw err;
  }

  const tokens = await createTokenPair(user, session);

  // Registration must remain successful even when external mail delivery is down.
  try {
    await requestEmailVerification(user.id, user.email, user.firstName);
  } catch (err: unknown) {
    logger.warn({ err }, "Verification email could not be prepared or delivered after registration");
  }

  return { ...tokens, user: toPublicUser(user) };
}

export async function loginUser(dto: LoginDto, session?: SessionContext) {
  const user = await prisma.user.findUnique({
    where: { email: dto.email.trim().toLowerCase() },
  });
  if (!user || !user.isActive) throw apiError("Invalid credentials", 401);

  const valid = await comparePassword(dto.password, user.passwordHash);
  if (!valid) throw apiError("Invalid credentials", 401);

  if (user.twoFactorEnabled) {
    return createTwoFactorLoginChallenge(user.id);
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const tokens = await createTokenPair(updatedUser, session);
  return { twoFactorRequired: false as const, ...tokens, user: toPublicUser(updatedUser) };
}

export async function completeTwoFactorLogin(
  challengeToken: string,
  code: string,
  session?: SessionContext,
) {
  const user = await verifyTwoFactorLoginChallenge(challengeToken, code);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const tokens = await createTokenPair(updatedUser, session);
  return { twoFactorRequired: false as const, ...tokens, user: toPublicUser(updatedUser) };
}

async function findMatchingRefreshSessionIds(
  payload: JwtPayload,
  refreshToken: string,
): Promise<string[]> {
  if (payload.sid) {
    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.sid } });
    if (
      !stored ||
      stored.userId !== payload.sub ||
      stored.revoked ||
      stored.expiresAt <= new Date()
    ) {
      return [];
    }
    return (await compareToken(refreshToken, stored.tokenHash)) ? [stored.id] : [];
  }

  // Compatibility path for access/refresh tokens issued before session ids were
  // embedded in JWTs. All matching legacy rows are revoked to prevent replay.
  const legacyRows = await prisma.refreshToken.findMany({
    where: {
      userId: payload.sub,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
  });
  const matches: string[] = [];
  for (const row of legacyRows) {
    if (await compareToken(refreshToken, row.tokenHash)) matches.push(row.id);
  }
  return matches;
}

export async function refreshTokens(refreshToken: string, session?: SessionContext) {
  let payload: JwtPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw apiError("Invalid refresh token", 401);
  }

  const matchingIds = await findMatchingRefreshSessionIds(payload, refreshToken);
  if (matchingIds.length === 0) throw apiError("Refresh token not found or revoked", 401);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw apiError("User not found", 401);

  const newSessionId = randomUUID();
  const newRefreshToken = signRefreshToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: newSessionId,
  });
  const newTokenHash = await hashToken(newRefreshToken);
  const metadata = sessionMetadata(session);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: {
        id: { in: matchingIds },
        userId: user.id,
        revoked: false,
        expiresAt: { gt: now },
      },
      data: { revoked: true, revokedAt: now, lastUsedAt: now },
    });
    if (claimed.count === 0) throw apiError("Refresh token not found or revoked", 401);

    await tx.refreshToken.create({
      data: {
        id: newSessionId,
        userId: user.id,
        tokenHash: newTokenHash,
        expiresAt: getRefreshExpiryDate(),
        ...metadata,
        lastUsedAt: now,
      },
    });
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: newSessionId,
  });
  return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(user) };
}

export async function revokeRefreshToken(userId: string, refreshToken: string) {
  let payload: JwtPayload | null = null;
  try {
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.sub === userId) payload = decoded;
  } catch {
    // Fall back to a legacy hash scan below. Logout remains idempotent.
  }

  const candidateRows = payload?.sid
    ? await prisma.refreshToken.findMany({
        where: { id: payload.sid, userId, revoked: false },
      })
    : await prisma.refreshToken.findMany({ where: { userId, revoked: false } });

  const matchingIds: string[] = [];
  for (const row of candidateRows) {
    if (await compareToken(refreshToken, row.tokenHash)) matchingIds.push(row.id);
  }

  if (matchingIds.length > 0) {
    const now = new Date();
    await prisma.refreshToken.updateMany({
      where: { id: { in: matchingIds }, userId, revoked: false },
      data: { revoked: true, revokedAt: now, lastUsedAt: now },
    });
  }
}

export async function getSessions(userId: string, currentSessionId?: string) {
  const sessions = await prisma.refreshToken.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      deviceName: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
  });

  return sessions.map((session) => ({
    id: session.id,
    deviceName: session.deviceName,
    userAgentShort: session.userAgent ? session.userAgent.slice(0, 120) : null,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    expiresAt: session.expiresAt,
    isCurrent: session.id === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const result = await prisma.refreshToken.updateMany({
    where: { id: sessionId, userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });
  if (result.count === 0) throw apiError("Session not found", 404);
}

export async function revokeAllSessions(userId: string, keepSessionId?: string) {
  const now = new Date();
  if (keepSessionId) {
    return prisma.refreshToken.updateMany({
      where: {
        userId,
        revoked: false,
        NOT: { id: keepSessionId },
      },
      data: { revoked: true, revokedAt: now },
    });
  }
  return prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: now },
  });
}

export async function requestEmailVerification(
  userId: string,
  email: string,
  firstName: string,
) {
  const rawToken = generateSecureToken();
  const tokenHash = hashSecureToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt } });
  });

  await getMailer().sendEmailVerification(email, firstName, rawToken);
}

export async function requestEmailVerificationForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
  });
  if (!user) throw apiError("User not found", 404);
  if (user.emailVerifiedAt) throw apiError("Email is already verified", 409);

  await requestEmailVerification(user.id, user.email, user.firstName);
}

export async function confirmEmailVerification(token: string) {
  const tokenHash = hashSecureToken(token);
  const stored = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.usedAt) {
    throw apiError("Invalid or already-used verification token", 400);
  }
  if (stored.expiresAt <= new Date()) throw apiError("Verification token has expired", 400);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.updateMany({
      where: {
        id: stored.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      throw apiError("Invalid or already-used verification token", 400);
    }
    await tx.user.update({
      where: { id: stored.userId },
      data: { emailVerifiedAt: now },
    });
  });
}

const FORGOT_GENERIC_MSG = Object.freeze({
  message: "If this email address is registered, a password reset link has been sent.",
});

export async function requestPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, isActive: true },
  });

  if (!user || !user.isActive) return { ...FORGOT_GENERIC_MSG };

  const rawToken = generateSecureToken();
  const tokenHash = hashSecureToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
  });

  try {
    await getMailer().sendPasswordReset(user.email, user.firstName, rawToken);
  } catch (err: unknown) {
    // Never let SMTP behavior reveal whether the account exists.
    logger.warn({ err }, "Password-reset mail could not be delivered");
  }

  return { ...FORGOT_GENERIC_MSG };
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashSecureToken(token);
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.usedAt) throw apiError("Invalid or already-used reset token", 400);
  if (stored.expiresAt <= new Date()) throw apiError("Reset token has expired", 400);

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: {
        id: stored.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw apiError("Invalid or already-used reset token", 400);

    await tx.passwordResetToken.updateMany({
      where: {
        userId: stored.userId,
        id: { not: stored.id },
        usedAt: null,
      },
      data: { usedAt: now },
    });
    await tx.user.update({
      where: { id: stored.userId },
      data: { passwordHash },
    });
    await tx.refreshToken.updateMany({
      where: { userId: stored.userId, revoked: false },
      data: { revoked: true, revokedAt: now },
    });
  });
}
