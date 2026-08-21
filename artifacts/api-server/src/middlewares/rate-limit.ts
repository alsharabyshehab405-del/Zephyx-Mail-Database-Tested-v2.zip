import { createHash } from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface LimiterOverrides {
  max?: number;
  windowMs?: number;
}

export function createAuthRateLimit(overrides: LimiterOverrides = {}) {
  return rateLimit({
    windowMs:
      overrides.windowMs ?? positiveInt(process.env["AUTH_RATE_LIMIT_WINDOW_MS"], 15 * 60 * 1000),
    max: overrides.max ?? positiveInt(process.env["AUTH_RATE_LIMIT_MAX"], 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
    skip: (req) => req.method === "OPTIONS",
  });
}

function emailActionKey(normalizedIp: string, email: unknown): string {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 16);

  return `email-action:${normalizedIp}:${emailHash}`;
}

export function createEmailActionRateLimit(overrides: LimiterOverrides = {}) {
  return rateLimit({
    windowMs:
      overrides.windowMs ??
      positiveInt(process.env["EMAIL_ACTION_RATE_LIMIT_WINDOW_MS"], 10 * 60 * 1000),
    max: overrides.max ?? positiveInt(process.env["EMAIL_ACTION_RATE_LIMIT_MAX"], 3),
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      keyGeneratorIpFallback: false,
    },
    message: {
      error: "Too many email requests, please try again later.",
    },
    skip: (req) => req.method === "OPTIONS",
    keyGenerator: (req) => {
      const body = req.body as Record<string, unknown> | undefined;
      const normalizedIp = ipKeyGenerator(req.ip ?? "unknown");

      const userId =
        (req as typeof req & { user?: { sub?: string } }).user?.sub;

      const identifier =
        typeof body?.["email"] === "string" && body["email"].trim()
          ? body["email"]
          : userId ?? "";

      return emailActionKey(normalizedIp, identifier);
    },
  });
}

export function createPasswordResetRateLimit(overrides: LimiterOverrides = {}) {
  return rateLimit({
    windowMs:
      overrides.windowMs ??
      positiveInt(process.env["PASSWORD_RESET_RATE_LIMIT_WINDOW_MS"], 10 * 60 * 1000),
    max: overrides.max ?? positiveInt(process.env["PASSWORD_RESET_RATE_LIMIT_MAX"], 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many reset attempts, please try again later.",
    },
    skip: (req) => req.method === "OPTIONS",
  });
}

export const authRateLimit = createAuthRateLimit();
export const emailActionRateLimit = createEmailActionRateLimit();
export const passwordResetRateLimit = createPasswordResetRateLimit();
