import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type JwtPayload } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

async function authenticateRequest(req: Request): Promise<JwtPayload> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing or invalid authorization header"), {
      statusCode: 401,
    });
  }

  const token = authHeader.slice(7);
  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw Object.assign(new Error("Invalid or expired access token"), { statusCode: 401 });
  }

  // New access tokens are bound to an active refresh-session record. This makes
  // session revocation and password resets invalidate access immediately.
  // Legacy tokens without sid remain valid only until their short expiry.
  if (payload.sid) {
    const activeSession = await prisma.refreshToken.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!activeSession) {
      throw Object.assign(new Error("Session has expired or been revoked"), { statusCode: 401 });
    }
  }

  return payload;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    (req as AuthenticatedRequest).user = await authenticateRequest(req);
    next();
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (!e.statusCode || e.statusCode >= 500) {
      logger.error({ err: e }, "Authentication middleware failed");
    }
    res.status(e.statusCode ?? 503).json({
      error: e.statusCode && e.statusCode < 500 ? e.message : "Authentication service unavailable",
    });
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await authenticateRequest(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    (req as AuthenticatedRequest).user = user;
    next();
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (!e.statusCode || e.statusCode >= 500) {
      logger.error({ err: e }, "Admin authentication middleware failed");
    }
    res.status(e.statusCode ?? 503).json({
      error: e.statusCode && e.statusCode < 500 ? e.message : "Authentication service unavailable",
    });
  }
}
