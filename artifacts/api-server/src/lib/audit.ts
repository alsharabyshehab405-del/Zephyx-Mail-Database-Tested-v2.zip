import crypto from "node:crypto";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { auditLogsTable, db } from "@workspace/db";
import { computeAuditIntegrityHash } from "./audit-integrity.js";
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
  organizationId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  success?: boolean;
  ip?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const organizationId = input.organizationId ?? null;
    const scopeKey = organizationId ?? "personal";
    await db.transaction(async (tx) => {
      // Serialize chain-head reads and inserts within each organization/personal scope.
      // This prevents concurrent writers from creating two rows with the same predecessor.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))`);
      const previous = await tx
        .select({ integrityHash: auditLogsTable.integrityHash })
        .from(auditLogsTable)
        .where(organizationId === null ? isNull(auditLogsTable.organizationId) : eq(auditLogsTable.organizationId, organizationId))
        .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
        .limit(1);
      const id = crypto.randomUUID();
      const createdAt = new Date();
      const metadata = sanitizeAuditMetadata(input.metadata);
      const success = input.success !== false;
      const ipHash = hashIp(input.ip) ?? null;
      const previousIntegrityHash = previous[0]?.integrityHash ?? null;
      const integrityHash = computeAuditIntegrityHash({
        id,
        organizationId,
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        success,
        ipHash,
        metadata,
        createdAt: createdAt.toISOString(),
        previousIntegrityHash,
      });
      await tx.insert(auditLogsTable).values({
        id,
        userId: input.userId ?? null,
        organizationId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        success,
        ipHash,
        metadata,
        previousIntegrityHash,
        integrityHash,
        createdAt,
      });
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, "Audit log write failed");
  }
}
