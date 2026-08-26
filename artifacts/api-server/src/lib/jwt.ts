import jwt, { type JwtPayload as JsonWebTokenPayload } from "jsonwebtoken";

const ACCESS_EXPIRY = process.env["JWT_ACCESS_EXPIRY"] ?? "15m";
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET", devFallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;

  if (process.env["NODE_ENV"] === "production") {
    throw new Error(`${name} must be configured in production`);
  }

  return devFallback;
}

const ACCESS_SECRET = readSecret("JWT_ACCESS_SECRET", "novamail-access-secret-dev-only");
const REFRESH_SECRET = readSecret("JWT_REFRESH_SECRET", "novamail-refresh-secret-dev-only");

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Refresh-session id. New tokens always include it; legacy tokens may not. */
  sid?: string;
}

function normalizePayload(decoded: string | JsonWebTokenPayload): JwtPayload {
  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.role !== "string"
  ) {
    throw new Error("Invalid token payload");
  }

  if (decoded.sid !== undefined && typeof decoded.sid !== "string") {
    throw new Error("Invalid token session payload");
  }

  return {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    ...(decoded.sid ? { sid: decoded.sid } : {}),
  };
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): JwtPayload {
  return normalizePayload(jwt.verify(token, ACCESS_SECRET));
}

export function verifyRefreshToken(token: string): JwtPayload {
  return normalizePayload(jwt.verify(token, REFRESH_SECRET));
}

export function getRefreshExpiryDate(): Date {
  return new Date(Date.now() + REFRESH_EXPIRY_MS);
}
