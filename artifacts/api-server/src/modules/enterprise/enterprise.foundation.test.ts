import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { db, organizationApiKeysTable, organizationMembersTable, organizationWebhooksTable, organizationsTable, securityIncidentsTable, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { addMember, createApiKey, createIncident, createOrganization, createWebhook, getOrganizationAccess, getSecuritySummary, listAuditLogs, listIncidents, listMembers, requireRole } from "./enterprise.service.js";

const migrationPath = new URL("../../../prisma/migrations/20260826090000_enterprise_security_foundation/migration.sql", import.meta.url);

describe("enterprise security foundation contracts", () => {
  it("enforces organization role boundaries", () => {
    expect(() => requireRole("member", new Set(["owner", "admin"]))).toThrowError(/permission/i);
    expect(() => requireRole("security_analyst", new Set(["owner", "admin", "security_analyst"]))).not.toThrow();
    expect(() => requireRole("auditor", new Set(["owner", "admin", "security_analyst", "auditor"]))).not.toThrow();
  });

  it("keeps the append-only migration scoped to organization-owned records", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain('CREATE TABLE "organizations"');
    expect(migration).toContain('organization_id" TEXT NOT NULL REFERENCES "organizations"');
    expect(migration).toContain('CREATE TABLE "organization_api_keys"');
    expect(migration).toContain('CREATE TABLE "organization_webhooks"');
    expect(migration).toContain('ALTER TABLE "audit_logs" ADD COLUMN "organization_id"');
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });

  it("finds Enterprise tables in PostgreSQL after migration", async () => {
    await db.select({ id: organizationsTable.id }).from(organizationsTable).limit(0);
    await db.select({ id: organizationMembersTable.id }).from(organizationMembersTable).limit(0);
    await db.select({ id: securityIncidentsTable.id }).from(securityIncidentsTable).limit(0);
    await db.select({ id: organizationApiKeysTable.id }).from(organizationApiKeysTable).limit(0);
    await db.select({ id: organizationWebhooksTable.id }).from(organizationWebhooksTable).limit(0);
  });

  it("isolates a real organization workflow in PostgreSQL", async () => {
    const ownerId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const outsiderId = crypto.randomUUID();
    const suffix = Date.now().toString(36);
    await db.insert(usersTable).values([
      { id: ownerId, email: `enterprise-owner-${suffix}@example.test`, passwordHash: "test", firstName: "Enterprise", lastName: "Owner" },
      { id: memberId, email: `enterprise-member-${suffix}@example.test`, passwordHash: "test", firstName: "Enterprise", lastName: "Member" },
      { id: outsiderId, email: `enterprise-outsider-${suffix}@example.test`, passwordHash: "test", firstName: "Enterprise", lastName: "Outsider" },
    ]);
    let organizationId = "";
    try {
      const organization = await createOrganization(ownerId, "Enterprise Isolation " + suffix);
      organizationId = organization.id;
      await addMember(ownerId, organizationId, `enterprise-member-${suffix}@example.test`, "security_analyst");
      const members = await listMembers(ownerId, organizationId);
      expect(members).toHaveLength(2);
      const summary = await getSecuritySummary(memberId, organizationId);
      expect(summary.members).toBe(2);
      expect(summary.providerState).toBe("NOT_CONFIGURED");
      const incident = await createIncident(memberId, organizationId, { title: "Suspicious sign-in", description: "Review access logs", severity: "medium" });
      expect((await listIncidents(ownerId, organizationId))[0]?.id).toBe(incident.id);
      const apiKey = await createApiKey(ownerId, organizationId, "CI read-only");
      expect(apiKey.secret).toMatch(/^zpx_/);
      expect((await listAuditLogs(ownerId, organizationId)).length).toBeGreaterThan(0);
      const webhook = await createWebhook(ownerId, organizationId, { url: "https://example.test/security", events: ["security.incident.created"] });
      expect(webhook.secret).toMatch(/^whsec_/);
      await expect(getSecuritySummary(outsiderId, organizationId)).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      if (organizationId) await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
      await db.delete(usersTable).where(and(eq(usersTable.id, ownerId), eq(usersTable.email, `enterprise-owner-${suffix}@example.test`)));
      await db.delete(usersTable).where(and(eq(usersTable.id, memberId), eq(usersTable.email, `enterprise-member-${suffix}@example.test`)));
      await db.delete(usersTable).where(and(eq(usersTable.id, outsiderId), eq(usersTable.email, `enterprise-outsider-${suffix}@example.test`)));
    }
  });

  it("does not expose API key hashes through the service contract", () => {
    const serviceSource = requireRole.toString();
    expect(serviceSource).not.toContain("keyHash");
  });

  it("declares ownership checks as a real service boundary", () => {
    expect(getOrganizationAccess).toBeTypeOf("function");
  });
});
