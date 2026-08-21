import type { NextFunction, Request, Response } from "express";
import { writeAuditLog } from "../lib/audit.js";
import type { AuthenticatedRequest } from "./auth.js";

const sensitivePath = /\/api\/(auth|gmail|admin)|\/api\/emails(?:\/[^/]+)?(?:\/export)?|\/api\/users(?:\/[^/]+)?(?:\/password|\/2fa|\/sessions|\/export)?/i;

export function auditSensitiveRequests(req: Request, res: Response, next: NextFunction): void {
  if (!sensitivePath.test(req.path) || ["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  res.once("finish", () => {
    const user = (req as AuthenticatedRequest).user;
    const action = `${req.method} ${req.path}`.replace(/[0-9a-f-]{20,}/gi, ":id");
    void writeAuditLog({
      userId: user?.sub ?? null,
      action,
      success: res.statusCode < 400,
      ip: req.ip,
      metadata: { statusCode: res.statusCode },
    });
  });
  next();
}
