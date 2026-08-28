import { describe, expect, it } from "vitest";
import { computeAuditIntegrityHash, type AuditIntegrityInput } from "./audit-integrity.js";

const baseInput: AuditIntegrityInput = {
  id: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000010",
  userId: "00000000-0000-4000-8000-000000000011",
  action: "security.incident.created",
  targetType: "incident",
  targetId: "00000000-0000-4000-8000-000000000012",
  success: true,
  ipHash: null,
  metadata: { severity: "high" },
  createdAt: "2026-08-27T00:00:00.000Z",
  previousIntegrityHash: null,
};

describe("audit integrity hash", () => {
  it("is deterministic for the same non-secret audit fields", () => {
    expect(computeAuditIntegrityHash(baseInput)).toBe(computeAuditIntegrityHash({ ...baseInput }));
  });

  it("changes when the previous chain link or audit field changes", () => {
    const first = computeAuditIntegrityHash(baseInput);
    const linked = computeAuditIntegrityHash({ ...baseInput, previousIntegrityHash: first });
    const tampered = computeAuditIntegrityHash({ ...baseInput, metadata: { severity: "critical" } });

    expect(linked).not.toBe(first);
    expect(tampered).not.toBe(first);
  });
});
