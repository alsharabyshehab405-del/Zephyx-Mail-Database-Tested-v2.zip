import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auditLogsTable, db, organizationsTable, usersTable } from "@workspace/db";
import { createOrganization } from "../modules/enterprise/enterprise.service.js";
import { writeAuditLog } from "./audit.js";

const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const ownerId = crypto.randomUUID();
const secondOwnerId = crypto.randomUUID();
const personalUserId = crypto.randomUUID();
const orgOneActions = Array.from({ length: 8 }, (_, index) => `assurance.chain.org-one.${index}`);
const orgTwoAction = "assurance.chain.org-two";
const personalAction = "assurance.chain.personal";
const userEmails = [
  `assurance-owner-${suffix}@example.test`,
  `assurance-second-owner-${suffix}@example.test`,
  `assurance-personal-${suffix}@example.test`,
];

function chronological<T extends { createdAt: Date; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
}

describe("Audit integrity chain PostgreSQL contract", () => {
  let organizationOneId = "";
  let organizationTwoId = "";

  it("serializes concurrent writes and keeps organization/personal chains isolated", async () => {
    await db.insert(usersTable).values([
      { id: ownerId, email: userEmails[0], passwordHash: "test-only", firstName: "Assurance", lastName: "Owner" },
      { id: secondOwnerId, email: userEmails[1], passwordHash: "test-only", firstName: "Assurance", lastName: "Second" },
      { id: personalUserId, email: userEmails[2], passwordHash: "test-only", firstName: "Assurance", lastName: "Personal" },
    ]);
    const organizationOne = await createOrganization(ownerId, `Assurance Chain One ${suffix}`);
    const organizationTwo = await createOrganization(secondOwnerId, `Assurance Chain Two ${suffix}`);
    organizationOneId = organizationOne.id;
    organizationTwoId = organizationTwo.id;

    await Promise.all(
      orgOneActions.map((action, index) =>
        writeAuditLog({
          userId: ownerId,
          organizationId: organizationOneId,
          action,
          targetType: "assurance-test",
          targetId: `org-one-${index}`,
          metadata: { safeMarker: index, secret: "must-not-be-stored", content: "must-not-be-stored" },
        }),
      ),
    );
    await writeAuditLog({ userId: secondOwnerId, organizationId: organizationTwoId, action: orgTwoAction, metadata: { safeMarker: true } });
    await writeAuditLog({ userId: personalUserId, action: personalAction, metadata: { safeMarker: "personal", token: "must-not-be-stored" } });

    const orgOneRows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.organizationId, organizationOneId));
    const orgTwoRows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.organizationId, organizationTwoId));
    const personalRows = await db
      .select()
      .from(auditLogsTable)
      .where(and(isNull(auditLogsTable.organizationId), eq(auditLogsTable.userId, personalUserId)));
    const selectedOrgOneRows = orgOneRows.filter((row) => orgOneActions.includes(row.action));
    const selectedOrgTwoRows = orgTwoRows.filter((row) => row.action === orgTwoAction);
    const selectedPersonalRows = personalRows.filter((row) => row.action === personalAction);

    expect(selectedOrgOneRows).toHaveLength(orgOneActions.length);
    expect(selectedOrgTwoRows).toHaveLength(1);
    expect(selectedPersonalRows).toHaveLength(1);
    expect(selectedOrgOneRows.every((row) => row.metadata && !Object.hasOwn(row.metadata, "secret") && !Object.hasOwn(row.metadata, "content"))).toBe(true);
    expect(selectedPersonalRows[0]?.metadata && !Object.hasOwn(selectedPersonalRows[0].metadata, "token")).toBe(true);

    const orderedOrgOne = chronological(selectedOrgOneRows);
    expect(orderedOrgOne.every((row) => typeof row.integrityHash === "string" && row.integrityHash.length === 64)).toBe(true);
    for (let index = 1; index < orderedOrgOne.length; index += 1) {
      expect(orderedOrgOne[index].previousIntegrityHash).toBe(orderedOrgOne[index - 1].integrityHash);
    }

    const orgOneHashes = new Set(orgOneRows.map((row) => row.integrityHash).filter((hash): hash is string => Boolean(hash)));
    expect(selectedOrgTwoRows[0]?.previousIntegrityHash && orgOneHashes.has(selectedOrgTwoRows[0].previousIntegrityHash)).toBe(false);
    expect(selectedPersonalRows[0]?.previousIntegrityHash && orgOneHashes.has(selectedPersonalRows[0].previousIntegrityHash)).toBe(false);
  });

  afterAll(async () => {
    const targetActions = [...orgOneActions, orgTwoAction, personalAction];
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.action, targetActions));
    if (organizationOneId) await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationOneId));
    if (organizationTwoId) await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationTwoId));
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.userId, [ownerId, secondOwnerId, personalUserId]));
    await db.delete(usersTable).where(inArray(usersTable.id, [ownerId, secondOwnerId, personalUserId]));
  });
});
