import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import QRCode from "qrcode";
import { generateSecret, generateURI, verify } from "otplib";
import type { User } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { comparePassword } from "../../lib/hash.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

function apiError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function getEncryptionKey(): Buffer {
  const raw = process.env["TWO_FACTOR_ENCRYPTION_KEY"]?.trim();
  if (!raw) throw apiError("Two-factor encryption key is not configured", 500);

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw apiError("Two-factor encryption key must decode to exactly 32 bytes", 500);
  }
  return key;
}

function encryptSecret(secret: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value: string): string {
  const [version, ivB64, tagB64, encryptedB64] = value.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) {
    throw apiError("Stored two-factor secret is invalid", 500);
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw apiError("Stored two-factor secret could not be decrypted", 500);
  }
}

function challengeHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-F0-9]/g, "");
}

function recoveryCodeHash(userId: string, code: string): string {
  return createHmac("sha256", getEncryptionKey())
    .update(`novamail-2fa-recovery:${userId}:${normalizeRecoveryCode(code)}`)
    .digest("hex");
}

function constantTimeHexEqual(left: string, right: string): boolean {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function generateRecoveryCode(): string {
  const raw = randomBytes(10).toString("hex").toUpperCase();
  return raw.match(/.{1,5}/g)?.join("-") ?? raw;
}

function makeRecoveryCodes(userId: string) {
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  const recoveryCodeHashes = recoveryCodes.map((code) => recoveryCodeHash(userId, code));
  return { recoveryCodes, recoveryCodeHashes };
}

async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const token = code.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const result = await verify({ secret, token, epochTolerance: 30 });
  return result.valid;
}

async function verifySecondFactor(
  user: Pick<User, "id" | "twoFactorSecretEncrypted" | "twoFactorRecoveryCodeHashes">,
  code: string,
): Promise<{ valid: boolean; recoveryHash?: string }> {
  if (!user.twoFactorSecretEncrypted) return { valid: false };

  if (await verifyTotp(decryptSecret(user.twoFactorSecretEncrypted), code)) {
    return { valid: true };
  }

  const candidate = recoveryCodeHash(user.id, code);
  const recoveryHash = user.twoFactorRecoveryCodeHashes.find((stored) =>
    constantTimeHexEqual(stored, candidate),
  );
  return recoveryHash ? { valid: true, recoveryHash } : { valid: false };
}

async function revokeOtherSessions(userId: string, currentSessionId?: string) {
  const now = new Date();
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revoked: false,
      ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}),
    },
    data: { revoked: true, revokedAt: now },
  });
}

export async function createTwoFactorLoginChallenge(userId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = challengeHash(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.twoFactorChallenge.deleteMany({
      where: {
        userId,
        OR: [{ usedAt: { not: null } }, { expiresAt: { lte: now } }],
      },
    });
    await tx.twoFactorChallenge.create({
      data: { userId, tokenHash, expiresAt },
    });
  });

  return {
    twoFactorRequired: true as const,
    challengeToken: rawToken,
    expiresInSeconds: Math.floor(CHALLENGE_TTL_MS / 1000),
  };
}

export async function verifyTwoFactorLoginChallenge(challengeToken: string, code: string) {
  const tokenHash = challengeHash(challengeToken);
  const now = new Date();
  const challenge = await prisma.twoFactorChallenge.findUnique({ where: { tokenHash } });

  if (
    !challenge ||
    challenge.usedAt ||
    challenge.expiresAt <= now ||
    challenge.attempts >= MAX_CHALLENGE_ATTEMPTS
  ) {
    throw apiError("Invalid or expired two-factor challenge", 401);
  }

  await prisma.twoFactorChallenge.update({
    where: { id: challenge.id },
    data: { attempts: { increment: 1 } },
  });

  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user || !user.isActive || !user.twoFactorEnabled) {
    throw apiError("Invalid or expired two-factor challenge", 401);
  }

  const verification = await verifySecondFactor(user, code);
  if (!verification.valid) throw apiError("Invalid verification code", 401);

  const claimed = await prisma.twoFactorChallenge.updateMany({
    where: {
      id: challenge.id,
      usedAt: null,
      expiresAt: { gt: now },
      attempts: { lte: MAX_CHALLENGE_ATTEMPTS },
    },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) throw apiError("Invalid or expired two-factor challenge", 401);

  if (verification.recoveryHash) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorRecoveryCodeHashes: user.twoFactorRecoveryCodeHashes.filter(
          (hash) => hash !== verification.recoveryHash,
        ),
      },
    });
  }

  return user;
}

export async function getTwoFactorStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorEnabledAt: true,
      twoFactorRecoveryCodeHashes: true,
    },
  });
  if (!user) throw apiError("User not found", 404);

  return {
    enabled: user.twoFactorEnabled,
    enabledAt: user.twoFactorEnabledAt,
    recoveryCodesRemaining: user.twoFactorRecoveryCodeHashes.length,
  };
}

export async function beginTwoFactorSetup(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404);
  if (user.twoFactorEnabled) throw apiError("Two-factor authentication is already enabled", 409);
  if (!(await comparePassword(password, user.passwordHash))) {
    throw apiError("Invalid password", 401);
  }

  const secret = generateSecret();
  const issuer = process.env["TWO_FACTOR_ISSUER"]?.trim() || process.env["APP_NAME"]?.trim() || "Zephyx Mail";
  const otpauthUrl = generateURI({ issuer, label: user.email, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecretEncrypted: encryptSecret(secret),
      twoFactorRecoveryCodeHashes: [],
      twoFactorEnabledAt: null,
    },
  });

  return { qrCodeDataUrl, manualEntryKey: secret, issuer, account: user.email };
}

export async function enableTwoFactor(userId: string, code: string, currentSessionId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404);
  if (user.twoFactorEnabled) throw apiError("Two-factor authentication is already enabled", 409);
  if (!user.twoFactorSecretEncrypted) {
    throw apiError("Start two-factor setup before enabling it", 400);
  }

  const valid = await verifyTotp(decryptSecret(user.twoFactorSecretEncrypted), code);
  if (!valid) throw apiError("Invalid verification code", 401);

  const { recoveryCodes, recoveryCodeHashes } = makeRecoveryCodes(user.id);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: now,
        twoFactorRecoveryCodeHashes: recoveryCodeHashes,
      },
    });
    await tx.twoFactorChallenge.deleteMany({ where: { userId: user.id } });
  });
  await revokeOtherSessions(user.id, currentSessionId);

  return { enabled: true, recoveryCodes };
}

export async function disableTwoFactor(
  userId: string,
  password: string,
  code: string,
  currentSessionId?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404);
  if (!user.twoFactorEnabled) throw apiError("Two-factor authentication is not enabled", 409);
  if (!(await comparePassword(password, user.passwordHash))) {
    throw apiError("Invalid password", 401);
  }

  const verification = await verifySecondFactor(user, code);
  if (!verification.valid) throw apiError("Invalid verification code", 401);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
        twoFactorSecretEncrypted: null,
        twoFactorRecoveryCodeHashes: [],
      },
    });
    await tx.twoFactorChallenge.deleteMany({ where: { userId: user.id } });
  });
  await revokeOtherSessions(user.id, currentSessionId);

  return { message: "Two-factor authentication has been disabled." };
}

export async function regenerateRecoveryCodes(userId: string, password: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404);
  if (!user.twoFactorEnabled) throw apiError("Two-factor authentication is not enabled", 409);
  if (!(await comparePassword(password, user.passwordHash))) {
    throw apiError("Invalid password", 401);
  }

  const verification = await verifySecondFactor(user, code);
  if (!verification.valid) throw apiError("Invalid verification code", 401);

  const { recoveryCodes, recoveryCodeHashes } = makeRecoveryCodes(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorRecoveryCodeHashes: recoveryCodeHashes },
  });
  return { recoveryCodes };
}
