import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  consentRecordsTable,
  db,
  emailsTable,
  enterprisePoliciesTable,
  securityIncidentsTable,
  organizationMembersTable,
  privacyRequestsTable,
  quarantineItemsTable,
  spamLearningEventsTable,
  threatCampaignMembersTable,
  threatCampaignsTable,
} from "@workspace/db";
import { getOrganizationAccess, requireRole, writeOrganizationAudit, type OrganizationRole } from "./enterprise.service.js";

const securityRoles = new Set<OrganizationRole>(["owner", "admin", "security_analyst", "auditor"]);
const policyWriteRoles = new Set<OrganizationRole>(["owner", "admin", "security_analyst"]);
const privilegedRoles = new Set<OrganizationRole>(["owner", "admin"]);
const quarantineTransitions: Record<string, ReadonlySet<string>> = {
  quarantined: new Set(["released", "reported", "appealed"]),
  appealed: new Set(["released", "reported"]),
  reported: new Set(["released"]),
  released: new Set(),
};

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

function senderDomain(value: string): string {
  return value.trim().toLowerCase().split("@").pop() || "unknown";
}

function boundedRisk(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function ownedOrganizationEmail(userId: string, organizationId: string, emailId: string) {
  await getOrganizationAccess(userId, organizationId);
  const [email] = await db.select().from(emailsTable).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId))).limit(1);
  if (!email) fail("Email not found or access denied", 404);
  return email;
}

export async function listQuarantine(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  const rows = await db.select().from(quarantineItemsTable).where(eq(quarantineItemsTable.organizationId, organizationId)).orderBy(desc(quarantineItemsTable.createdAt)).limit(200);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null }));
}

export async function quarantineEmail(userId: string, organizationId: string, emailId: string, reason: string, riskScore: number, incidentId?: string | null) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  await ownedOrganizationEmail(userId, organizationId, emailId);
  if (incidentId) {
    const [incident] = await db.select({ id: securityIncidentsTable.id }).from(securityIncidentsTable).where(and(eq(securityIncidentsTable.id, incidentId), eq(securityIncidentsTable.organizationId, organizationId))).limit(1);
    if (!incident) fail("Incident not found in organization", 404);
  }
  const [item] = await db.insert(quarantineItemsTable).values({ organizationId, emailId, userId, incidentId: incidentId ?? null, createdBy: userId, reason: reason.trim(), riskScore: boundedRisk(riskScore), metadata: { source: "local_security_engine", aiBlocking: false } }).onConflictDoUpdate({ target: [quarantineItemsTable.organizationId, quarantineItemsTable.emailId, quarantineItemsTable.userId], set: { reason: reason.trim(), riskScore: boundedRisk(riskScore), status: "quarantined", resolvedBy: null, resolvedAt: null } }).returning();
  if (!item) throw new Error("Quarantine item could not be persisted");
  await writeOrganizationAudit(userId, organizationId, "quarantine.created", "quarantine", item.id, { emailId, riskScore: item.riskScore });
  return { ...item, createdAt: item.createdAt.toISOString(), resolvedAt: null };
}

export async function transitionQuarantine(userId: string, organizationId: string, quarantineId: string, status: "released" | "reported" | "appealed") {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, status === "released" ? privilegedRoles : securityRoles);
  const [existing] = await db.select().from(quarantineItemsTable).where(and(eq(quarantineItemsTable.id, quarantineId), eq(quarantineItemsTable.organizationId, organizationId))).limit(1);
  if (!existing) fail("Quarantine item not found", 404);
  if (!quarantineTransitions[existing.status]?.has(status)) fail(`Invalid quarantine transition from ${existing.status} to ${status}`, 409);
  const [updated] = await db.update(quarantineItemsTable).set({ status, resolvedBy: userId, resolvedAt: new Date() }).where(and(eq(quarantineItemsTable.id, quarantineId), eq(quarantineItemsTable.organizationId, organizationId))).returning();
  if (!updated) throw new Error("Quarantine transition could not be persisted");
  await writeOrganizationAudit(userId, organizationId, `quarantine.${status}`, "quarantine", quarantineId, { previousStatus: existing.status, status });
  return { ...updated, createdAt: updated.createdAt.toISOString(), resolvedAt: updated.resolvedAt?.toISOString() ?? null };
}

export async function listPolicies(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  return db.select().from(enterprisePoliciesTable).where(eq(enterprisePoliciesTable.organizationId, organizationId)).orderBy(asc(enterprisePoliciesTable.name));
}

export type PolicyInput = {
  name: string;
  scope: "organization" | "user" | "group";
  targetUserId?: string | null;
  targetGroup?: string | null;
  enabled?: boolean;
  riskThreshold?: number;
  linkAction?: "allow" | "warn" | "quarantine" | "block";
  attachmentAction?: "allow" | "warn" | "quarantine" | "block";
  senderAction?: "allow" | "warn" | "quarantine" | "block";
  allowlist?: string[];
  blocklist?: string[];
};

function policyValues(input: PolicyInput) {
  const riskThreshold = boundedRisk(input.riskThreshold ?? 80);
  return { name: input.name.trim(), scope: input.scope, targetUserId: input.targetUserId ?? null, targetGroup: input.targetGroup?.trim() || null, enabled: input.enabled ?? true, riskThreshold, linkAction: input.linkAction ?? "warn", attachmentAction: input.attachmentAction ?? "quarantine", senderAction: input.senderAction ?? "warn", allowlist: [...new Set((input.allowlist ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, 500), blocklist: [...new Set((input.blocklist ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, 500) };
}

export async function createPolicy(userId: string, organizationId: string, input: PolicyInput) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, policyWriteRoles);
  if (input.scope === "user" && !input.targetUserId) fail("User-scoped policy requires targetUserId", 400);
  if (input.scope === "group" && !input.targetGroup) fail("Group-scoped policy requires targetGroup", 400);
  if (input.targetUserId) {
    const [member] = await db.select({ userId: organizationMembersTable.userId }).from(organizationMembersTable).where(and(eq(organizationMembersTable.organizationId, organizationId), eq(organizationMembersTable.userId, input.targetUserId))).limit(1);
    if (!member) fail("Policy target user is not an organization member", 400);
  }
  const [policy] = await db.insert(enterprisePoliciesTable).values({ organizationId, createdBy: userId, ...policyValues(input) }).returning();
  if (!policy) throw new Error("Policy could not be persisted");
  await writeOrganizationAudit(userId, organizationId, "policy.created", "policy", policy.id, { scope: policy.scope, riskThreshold: policy.riskThreshold });
  return policy;
}

export async function updatePolicy(userId: string, organizationId: string, policyId: string, input: Partial<PolicyInput>) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, policyWriteRoles);
  const [existing] = await db.select().from(enterprisePoliciesTable).where(and(eq(enterprisePoliciesTable.id, policyId), eq(enterprisePoliciesTable.organizationId, organizationId))).limit(1);
  if (!existing) fail("Policy not found", 404);
  const merged = policyValues({ name: input.name ?? existing.name, scope: input.scope ?? existing.scope, targetUserId: input.targetUserId === undefined ? existing.targetUserId : input.targetUserId, targetGroup: input.targetGroup === undefined ? existing.targetGroup : input.targetGroup, enabled: input.enabled ?? existing.enabled, riskThreshold: input.riskThreshold ?? existing.riskThreshold, linkAction: input.linkAction ?? existing.linkAction, attachmentAction: input.attachmentAction ?? existing.attachmentAction, senderAction: input.senderAction ?? existing.senderAction, allowlist: input.allowlist ?? existing.allowlist, blocklist: input.blocklist ?? existing.blocklist });
  if (merged.scope === "user" && !merged.targetUserId) fail("User-scoped policy requires targetUserId", 400);
  if (merged.scope === "group" && !merged.targetGroup) fail("Group-scoped policy requires targetGroup", 400);
  const [updated] = await db.update(enterprisePoliciesTable).set({ ...merged, updatedAt: new Date() }).where(and(eq(enterprisePoliciesTable.id, policyId), eq(enterprisePoliciesTable.organizationId, organizationId))).returning();
  if (!updated) throw new Error("Policy could not be updated");
  await writeOrganizationAudit(userId, organizationId, "policy.updated", "policy", policyId, { enabled: updated.enabled, riskThreshold: updated.riskThreshold });
  return updated;
}

export async function evaluateEnterprisePolicy(userId: string, organizationId: string, emailId: string, riskScore: number, signal: "link" | "attachment" | "sender") {
  const email = await ownedOrganizationEmail(userId, organizationId, emailId);
  const policies = await db.select().from(enterprisePoliciesTable).where(and(eq(enterprisePoliciesTable.organizationId, organizationId), eq(enterprisePoliciesTable.enabled, true)));
  const domain = senderDomain(email.fromEmail);
  const applicable = policies.filter((policy) => policy.scope === "organization" || (policy.scope === "user" && policy.targetUserId === userId));
  const matched = applicable.find((policy) => policy.blocklist.some((entry) => domain === entry || domain.endsWith(`.${entry}`)) || policy.allowlist.some((entry) => domain === entry || domain.endsWith(`.${entry}`)) || riskScore >= policy.riskThreshold);
  if (!matched) return { action: "allow" as const, reason: "No matching enterprise policy", policyId: null, riskScore: boundedRisk(riskScore), domain };
  const listBlocked = matched.blocklist.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
  const listAllowed = matched.allowlist.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
  const action = listBlocked ? "block" : listAllowed ? "allow" : matched[`${signal}Action`];
  return { action, reason: listBlocked ? "Sender domain is on the organization blocklist" : listAllowed ? "Sender domain is on the organization allowlist" : `Risk score reached policy threshold ${matched.riskThreshold}`, policyId: matched.id, riskScore: boundedRisk(riskScore), domain };
}

export async function recordSpamLearning(userId: string, organizationId: string, emailId: string, feedbackType: "spam" | "not_spam") {
  const email = await ownedOrganizationEmail(userId, organizationId, emailId);
  const domain = senderDomain(email.fromEmail);
  const signal = feedbackType === "spam" ? "user_reported_spam" : "user_confirmed_not_spam";
  const reason = feedbackType === "spam" ? "Organization member reported the sender as spam" : "Organization member marked the sender as not spam";
  const [row] = await db.insert(spamLearningEventsTable).values({ organizationId, userId, emailId, feedbackType, senderDomain: domain, signal, reason }).onConflictDoUpdate({ target: [spamLearningEventsTable.organizationId, spamLearningEventsTable.emailId, spamLearningEventsTable.userId], set: { feedbackType, senderDomain: domain, signal, reason } }).returning();
  if (!row) throw new Error("Spam learning event could not be persisted");
  await writeOrganizationAudit(userId, organizationId, "spam.learning.updated", "email", emailId, { feedbackType, learningScope: "organization", senderDomain: domain });
  return { id: row.id, organizationId, emailId, feedbackType, learningScope: "organization" as const, senderDomain: domain, reason: row.reason, createdAt: row.createdAt.toISOString() };
}

export async function getSpamLearningSummary(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  const rows = await db.select().from(spamLearningEventsTable).where(eq(spamLearningEventsTable.organizationId, organizationId)).orderBy(desc(spamLearningEventsTable.createdAt)).limit(500);
  const domains = new Map<string, { spam: number; notSpam: number }>();
  for (const row of rows) { const current = domains.get(row.senderDomain) ?? { spam: 0, notSpam: 0 }; if (row.feedbackType === "spam") current.spam += 1; else current.notSpam += 1; domains.set(row.senderDomain, current); }
  return { organizationId, events: rows.length, domains: [...domains.entries()].map(([domain, counts]) => ({ domain, ...counts })), dataScope: "organization_only" as const };
}

function campaignFingerprint(subject: string, domain: string, body: string): string {
  return createHash("sha256").update(`${domain}|${subject.trim().toLowerCase().replace(/\\s+/g, " ").slice(0, 160)}|${body.trim().toLowerCase().replace(/\\s+/g, " ").slice(0, 240)}`).digest("hex");
}

export async function correlateThreatCampaign(userId: string, organizationId: string, emailId: string, riskScore: number, signals: string[] = []) {
  const email = await ownedOrganizationEmail(userId, organizationId, emailId);
  const domain = senderDomain(email.fromEmail);
  const fingerprint = campaignFingerprint(email.subject, domain, email.bodyText || email.bodyHtml);
  const label = `Local correlation: ${domain}`;
  const now = new Date();
  const [campaign] = await db.insert(threatCampaignsTable).values({ organizationId, fingerprint, label, riskScore: boundedRisk(riskScore), messageCount: 1, evidence: [...new Set(signals)].slice(0, 20), firstSeenAt: now, lastSeenAt: now }).onConflictDoUpdate({ target: [threatCampaignsTable.organizationId, threatCampaignsTable.fingerprint], set: { riskScore: boundedRisk(riskScore), messageCount: sql`${threatCampaignsTable.messageCount} + 1`, evidence: [...new Set(signals)].slice(0, 20), lastSeenAt: now, updatedAt: now } }).returning();
  if (!campaign) throw new Error("Threat campaign could not be persisted");
  await db.insert(threatCampaignMembersTable).values({ campaignId: campaign.id, organizationId, emailId, userId, relation: "local_subject_sender_body_fingerprint" }).onConflictDoNothing();
  await writeOrganizationAudit(userId, organizationId, "campaign.correlated", "campaign", campaign.id, { emailId, messageCount: campaign.messageCount, dataSource: "local_findings_only" });
  return { ...campaign, createdAt: campaign.createdAt.toISOString(), firstSeenAt: campaign.firstSeenAt.toISOString(), lastSeenAt: campaign.lastSeenAt.toISOString(), updatedAt: campaign.updatedAt.toISOString() };
}

export async function listThreatCampaigns(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  const campaigns = await db.select().from(threatCampaignsTable).where(eq(threatCampaignsTable.organizationId, organizationId)).orderBy(desc(threatCampaignsTable.lastSeenAt)).limit(200);
  return campaigns;
}

export async function createPrivacyRequest(userId: string, organizationId: string | null, requestType: "export" | "delete", reason: string) {
  if (organizationId) await getOrganizationAccess(userId, organizationId);
  const [request] = await db.insert(privacyRequestsTable).values({ userId, organizationId, requestType, reason: reason.trim() }).returning();
  if (!request) throw new Error("Privacy request could not be persisted");
  await writeOrganizationAudit(userId, organizationId ?? "personal", `privacy.${requestType}.requested`, "privacy_request", request.id, { requestType });
  return { ...request, requestedAt: request.requestedAt.toISOString(), completedAt: null };
}

export async function listPrivacyRequests(userId: string, organizationId: string | null) {
  if (organizationId) {
    const access = await getOrganizationAccess(userId, organizationId);
    requireRole(access.membership.role, privilegedRoles);
    return db.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.organizationId, organizationId)).orderBy(desc(privacyRequestsTable.requestedAt));
  }
  return db.select().from(privacyRequestsTable).where(eq(privacyRequestsTable.userId, userId)).orderBy(desc(privacyRequestsTable.requestedAt));
}

export async function recordConsent(userId: string, organizationId: string | null, consentType: string, granted: boolean, scope = "organization") {
  if (organizationId) {
    const access = await getOrganizationAccess(userId, organizationId);
    requireRole(access.membership.role, privilegedRoles);
  }
  const [record] = await db.insert(consentRecordsTable).values({ userId, organizationId, consentType: consentType.trim(), granted, scope: scope.trim() || "organization" }).returning();
  if (!record) throw new Error("Consent could not be persisted");
  await writeOrganizationAudit(userId, organizationId ?? "personal", granted ? "privacy.consent.granted" : "privacy.consent.revoked", "consent", record.id, { consentType, scope });
  return { ...record, createdAt: record.createdAt.toISOString(), revokedAt: null };
}

export async function listConsents(userId: string, organizationId: string | null) {
  if (organizationId) await getOrganizationAccess(userId, organizationId);
  const where = organizationId ? and(eq(consentRecordsTable.organizationId, organizationId), eq(consentRecordsTable.userId, userId)) : eq(consentRecordsTable.userId, userId);
  return db.select().from(consentRecordsTable).where(where).orderBy(desc(consentRecordsTable.createdAt));
}
