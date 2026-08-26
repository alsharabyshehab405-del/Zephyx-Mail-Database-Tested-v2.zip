import crypto from "node:crypto";
import { auditLogsTable, db } from "@workspace/db";
import { logger } from "./logger.js";

const sensitiveKey = /password|token|secret|authorization|cookie|content|body|message/i;

export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (sensitiveKey.test(key)) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value;
  }
  return result;
}

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const secret = process.env.SESSION_IP_HASH_SECRET;
  if (!secret) return undefined;
  return crypto.createHmac("sha256", secret).update(ip).digest("hex");
}

export async function writeAuditLog(input: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  success?: boolean;
  ip?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: input.userId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      success: input.success !== false,
      ipHash: hashIp(input.ip),
      metadata: sanitizeAuditMetadata(input.metadata),
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, "Audit log write failed");
  }
}
