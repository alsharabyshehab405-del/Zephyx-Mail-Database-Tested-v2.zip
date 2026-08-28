import crypto from "node:crypto";

export type AuditIntegrityInput = {
  id: string;
  organizationId: string | null;
  userId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  success: boolean;
  ipHash: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
  previousIntegrityHash: string | null;
};

/**
 * Produce a deterministic chain digest from non-secret audit fields. The
 * previous digest links entries in an organization scope and makes accidental
 * reordering or mutation detectable. A deployment should additionally protect
 * the database and digest snapshots with an external KMS/Secret Manager.
 */
export function computeAuditIntegrityHash(input: AuditIntegrityInput): string {
  const canonical = JSON.stringify([
    input.id,
    input.organizationId,
    input.userId,
    input.action,
    input.targetType,
    input.targetId,
    input.success,
    input.ipHash,
    input.metadata,
    input.createdAt,
    input.previousIntegrityHash,
  ]);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}
