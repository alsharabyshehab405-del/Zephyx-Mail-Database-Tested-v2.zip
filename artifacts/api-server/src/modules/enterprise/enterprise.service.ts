import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogsTable,
  emailSecurityReportsTable,
  emailSecurityFeedbackTable,
  emailThreatAnalysesTable,
  emailAiPhishingAnalysesTable,
  organizationsTable,
  organizationApiKeysTable,
  organizationMembersTable,
  organizationWebhooksTable,
  securityIncidentsTable,
  usersTable,
  type Organization,
  type OrganizationMember,
} from "@workspace/db";
import { db } from "@workspace/db";
import { threatAnalysisProviderStatus } from "../security/threat-analysis-provider.js";

export type OrganizationRole = "owner" | "admin" | "security_analyst" | "auditor" | "member";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "investigating" | "contained" | "resolved";

const privilegedRoles = new Set<OrganizationRole>(["owner", "admin"]);
const securityRoles = new Set<OrganizationRole>(["owner", "admin", "security_analyst", "auditor"]);

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

function slugify(value: string): string {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return slug || `org-${Date.now()}`;
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function serializeDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export async function getOrganizationAccess(userId: string, organizationId: string): Promise<{ organization: Organization; membership: OrganizationMember }> {
  const [row] = await db
    .select({ organization: organizationsTable, membership: organizationMembersTable })
    .from(organizationMembersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationMembersTable.organizationId))
    .where(and(eq(organizationMembersTable.organizationId, organizationId), eq(organizationMembersTable.userId, userId)))
    .limit(1);
  if (!row) fail("Organization not found or access denied", 404);
  return row;
}

export function requireRole(role: OrganizationRole, allowed: ReadonlySet<OrganizationRole>): void {
  if (!allowed.has(role)) fail("Insufficient organization permission", 403);
}

export async function listOrganizations(userId: string) {
  const rows = await db
    .select({ organization: organizationsTable, role: organizationMembersTable.role })
    .from(organizationMembersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationMembersTable.organizationId))
    .where(eq(organizationMembersTable.userId, userId))
    .orderBy(asc(organizationsTable.name));
  return rows.map(({ organization, role }) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    role,
    createdAt: organization.createdAt.toISOString(),
  }));
}

export async function createOrganization(userId: string, name: string) {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [existing] = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${attempt + 2}`;
  }
  const id = crypto.randomUUID();
  const [organization] = await db.insert(organizationsTable).values({ id, name: name.trim(), slug, createdBy: userId }).returning();
  await db.insert(organizationMembersTable).values({ id: crypto.randomUUID(), organizationId: id, userId, role: "owner" });
  await writeOrganizationAudit(userId, id, "organization.created", "organization", id, { name: organization.name });
  return { id: organization.id, name: organization.name, slug: organization.slug, role: "owner" as const, createdAt: organization.createdAt.toISOString() };
}

export async function listMembers(userId: string, organizationId: string) {
  await getOrganizationAccess(userId, organizationId);
  const rows = await db
    .select({ member: organizationMembersTable, user: usersTable })
    .from(organizationMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, organizationMembersTable.userId))
    .where(eq(organizationMembersTable.organizationId, organizationId))
    .orderBy(asc(usersTable.email));
  return rows.map(({ member, user }) => ({
    id: member.id,
    userId: user.id,
    email: user.email,
    name: user.displayName ?? `${user.firstName} ${user.lastName}`.trim(),
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  }));
}

export async function addMember(actorId: string, organizationId: string, email: string, role: OrganizationRole) {
  const access = await getOrganizationAccess(actorId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  if (role === "owner") fail("Owner transfer requires an explicit ownership workflow", 400);
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
  if (!user) fail("User must register before being added to an organization", 404);
  const [member] = await db.insert(organizationMembersTable).values({ id: crypto.randomUUID(), organizationId, userId: user.id, role }).onConflictDoUpdate({ target: [organizationMembersTable.organizationId, organizationMembersTable.userId], set: { role, updatedAt: new Date() } }).returning();
  await writeOrganizationAudit(actorId, organizationId, "organization.member_upserted", "user", user.id, { role });
  return { id: member.id, userId: user.id, email: user.email, name: user.displayName ?? `${user.firstName} ${user.lastName}`.trim(), role: member.role, createdAt: member.createdAt.toISOString() };
}

export async function updateMemberRole(actorId: string, organizationId: string, memberId: string, role: OrganizationRole) {
  const access = await getOrganizationAccess(actorId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  const [target] = await db.select().from(organizationMembersTable).where(and(eq(organizationMembersTable.id, memberId), eq(organizationMembersTable.organizationId, organizationId))).limit(1);
  if (!target) fail("Organization member not found", 404);
  if (target.role === "owner" || role === "owner") fail("Owner membership cannot be changed through this endpoint", 400);
  const [updated] = await db.update(organizationMembersTable).set({ role, updatedAt: new Date() }).where(eq(organizationMembersTable.id, memberId)).returning();
  await writeOrganizationAudit(actorId, organizationId, "organization.member_role_changed", "membership", memberId, { role });
  return updated;
}

export async function getSecuritySummary(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  const members = await db.select({ userId: organizationMembersTable.userId }).from(organizationMembersTable).where(eq(organizationMembersTable.organizationId, organizationId));
  const userIds = members.map((member) => member.userId);
  // Threat Protection v1 rows predate organization tagging. Do not expose personal/account-scoped rows in an organization summary.
  const analyses: Array<{ overallRisk: string; spamScore: number; malwareStatus: string }> = [];
  const incidents = await db.select({ status: securityIncidentsTable.status, severity: securityIncidentsTable.severity }).from(securityIncidentsTable).where(eq(securityIncidentsTable.organizationId, organizationId));
  const feedback = await db.select({ feedbackType: emailSecurityFeedbackTable.feedbackType }).from(emailSecurityFeedbackTable).where(eq(emailSecurityFeedbackTable.organizationId, organizationId));
  const aiPhishing = userIds.length ? await db.select({ verdict: emailAiPhishingAnalysesTable.verdict, riskScore: emailAiPhishingAnalysesTable.riskScore }).from(emailAiPhishingAnalysesTable).where(and(eq(emailAiPhishingAnalysesTable.organizationId, organizationId), inArray(emailAiPhishingAnalysesTable.userId, userIds))) : [];
  const riskSummary = { safe: 0, suspicious: 0, dangerous: 0, blocked: 0 };
  for (const analysis of aiPhishing) {
    if (analysis.verdict === "blocked" || analysis.verdict === "dangerous") riskSummary.dangerous += 1;
    else if (analysis.verdict === "suspicious") riskSummary.suspicious += 1;
    else if (analysis.verdict === "safe") riskSummary.safe += 1;
  }
  const openIncidents = incidents.filter((incident) => incident.status !== "resolved").length;
  const criticalIncidents = incidents.filter((incident) => incident.severity === "critical" && incident.status !== "resolved").length;
  return {
    organization: { id: access.organization.id, name: access.organization.name, slug: access.organization.slug, role: access.membership.role },
    members: userIds.length,
    analyzedMessages: analyses.length,
    riskSummary,
    averageSpamScore: aiPhishing.length ? Math.round(aiPhishing.reduce((sum, item) => sum + item.riskScore, 0) / aiPhishing.length) : 0,
    openIncidents,
    criticalIncidents,
    reports: { spam: feedback.filter((row) => row.feedbackType === "spam").length, phishing: feedback.filter((row) => row.feedbackType === "phishing").length },
    aiPhishing: { enabled: access.organization.aiPhishingEnabled && Boolean(access.organization.aiPhishingConsentAt), provider: threatAnalysisProviderStatus(), analyzedMessages: aiPhishing.length, safe: aiPhishing.filter((row) => row.verdict === "safe").length, suspicious: aiPhishing.filter((row) => row.verdict === "suspicious").length, dangerous: aiPhishing.filter((row) => row.verdict === "dangerous").length, blocked: aiPhishing.filter((row) => row.verdict === "blocked").length, averageRiskScore: aiPhishing.length ? Math.round(aiPhishing.reduce((sum, row) => sum + row.riskScore, 0) / aiPhishing.length) : 0 },
    providerState: "NOT_CONFIGURED" as const,
    generatedAt: new Date().toISOString(),
  };
}

export async function updateAiPhishingConsent(userId: string, organizationId: string, enabled: boolean) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  const consentAt = enabled ? new Date() : null;
  const [organization] = await db.update(organizationsTable).set({ aiPhishingEnabled: enabled, aiPhishingConsentAt: consentAt, updatedAt: new Date() }).where(eq(organizationsTable.id, organizationId)).returning();
  await writeOrganizationAudit(userId, organizationId, enabled ? "ai.phishing.consent_enabled" : "ai.phishing.consent_disabled", "organization", organizationId, { enabled });
  return { organizationId, enabled: organization.aiPhishingEnabled, consentAt: organization.aiPhishingConsentAt?.toISOString() ?? null, provider: threatAnalysisProviderStatus() };
}

export async function listIncidents(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  const rows = await db.select().from(securityIncidentsTable).where(eq(securityIncidentsTable.organizationId, organizationId)).orderBy(desc(securityIncidentsTable.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), resolvedAt: serializeDate(row.resolvedAt) }));
}

export async function createIncident(userId: string, organizationId: string, input: { title: string; description: string; severity: IncidentSeverity }) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  const [incident] = await db.insert(securityIncidentsTable).values({ id: crypto.randomUUID(), organizationId, title: input.title.trim(), description: input.description.trim(), severity: input.severity, createdBy: userId }).returning();
  await writeOrganizationAudit(userId, organizationId, "incident.created", "incident", incident.id, { severity: input.severity });
  return { ...incident, createdAt: incident.createdAt.toISOString(), updatedAt: incident.updatedAt.toISOString(), resolvedAt: null };
}

export async function updateIncident(userId: string, organizationId: string, incidentId: string, input: { status?: IncidentStatus; severity?: IncidentSeverity; assignedTo?: string | null }) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, securityRoles);
  const [existing] = await db.select({ id: securityIncidentsTable.id }).from(securityIncidentsTable).where(and(eq(securityIncidentsTable.id, incidentId), eq(securityIncidentsTable.organizationId, organizationId))).limit(1);
  if (!existing) fail("Incident not found", 404);
  const [updated] = await db.update(securityIncidentsTable).set({ ...input, resolvedAt: input.status === "resolved" ? new Date() : undefined, updatedAt: new Date() }).where(eq(securityIncidentsTable.id, incidentId)).returning();
  await writeOrganizationAudit(userId, organizationId, "incident.updated", "incident", incidentId, input);
  return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(), resolvedAt: serializeDate(updated.resolvedAt) };
}

export async function listAuditLogs(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, new Set(["owner", "admin", "security_analyst", "auditor"]));
  const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.organizationId, organizationId)).orderBy(desc(auditLogsTable.createdAt)).limit(200);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function createApiKey(userId: string, organizationId: string, name: string, expiresAt?: Date | null) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  const secret = `zpx_${randomBytes(24).toString("hex")}`;
  const [key] = await db.insert(organizationApiKeysTable).values({ id: crypto.randomUUID(), organizationId, name: name.trim(), keyPrefix: secret.slice(0, 12), keyHash: hashSecret(secret), createdBy: userId, expiresAt: expiresAt ?? null }).returning();
  await writeOrganizationAudit(userId, organizationId, "api_key.created", "api_key", key.id, { name: key.name });
  return { id: key.id, name: key.name, keyPrefix: key.keyPrefix, secret, expiresAt: serializeDate(key.expiresAt), createdAt: key.createdAt.toISOString() };
}

export async function listApiKeys(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  const rows = await db.select().from(organizationApiKeysTable).where(eq(organizationApiKeysTable.organizationId, organizationId)).orderBy(desc(organizationApiKeysTable.createdAt));
  return rows.map((row) => ({ id: row.id, name: row.name, keyPrefix: row.keyPrefix, expiresAt: serializeDate(row.expiresAt), revokedAt: serializeDate(row.revokedAt), lastUsedAt: serializeDate(row.lastUsedAt), createdAt: row.createdAt.toISOString() }));
}

export async function revokeApiKey(userId: string, organizationId: string, keyId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  const [key] = await db.update(organizationApiKeysTable).set({ revokedAt: new Date() }).where(and(eq(organizationApiKeysTable.id, keyId), eq(organizationApiKeysTable.organizationId, organizationId))).returning({ id: organizationApiKeysTable.id });
  if (!key) fail("API key not found", 404);
  await writeOrganizationAudit(userId, organizationId, "api_key.revoked", "api_key", keyId, {});
  return { id: key.id, revoked: true };
}

export async function createWebhook(userId: string, organizationId: string, input: { url: string; events: string[] }) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  let parsedUrl: URL;
  try { parsedUrl = new URL(input.url); } catch { fail("Webhook URL is invalid", 400); }
  if (!/^https:$/.test(parsedUrl.protocol)) fail("Webhook URL must use HTTPS", 400);
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const [webhook] = await db.insert(organizationWebhooksTable).values({ id: crypto.randomUUID(), organizationId, url: parsedUrl.toString(), secretHash: hashSecret(secret), events: [...new Set(input.events)].slice(0, 20), createdBy: userId }).returning();
  await writeOrganizationAudit(userId, organizationId, "webhook.created", "webhook", webhook.id, { url: webhook.url, events: webhook.events.join(",") });
  return { id: webhook.id, url: webhook.url, events: webhook.events, active: webhook.active, secret, createdAt: webhook.createdAt.toISOString() };
}

export async function listWebhooks(userId: string, organizationId: string) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  const rows = await db.select().from(organizationWebhooksTable).where(eq(organizationWebhooksTable.organizationId, organizationId)).orderBy(desc(organizationWebhooksTable.createdAt));
  return rows.map((row) => ({ id: row.id, url: row.url, events: row.events, active: row.active, failureCount: row.failureCount, lastDeliveryAt: serializeDate(row.lastDeliveryAt), createdAt: row.createdAt.toISOString() }));
}

export async function setWebhookActive(userId: string, organizationId: string, webhookId: string, active: boolean) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, privilegedRoles);
  const [webhook] = await db.update(organizationWebhooksTable).set({ active, updatedAt: new Date() }).where(and(eq(organizationWebhooksTable.id, webhookId), eq(organizationWebhooksTable.organizationId, organizationId))).returning({ id: organizationWebhooksTable.id, active: organizationWebhooksTable.active });
  if (!webhook) fail("Webhook not found", 404);
  await writeOrganizationAudit(userId, organizationId, "webhook.updated", "webhook", webhookId, { active });
  return webhook;
}

export async function writeOrganizationAudit(userId: string | null, organizationId: string, action: string, targetType: string, targetId: string, metadata: Record<string, string | number | boolean | null>) {
  await db.insert(auditLogsTable).values({ id: crypto.randomUUID(), organizationId, userId, action, targetType, targetId, success: true, metadata });
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function securityCsv(userId: string, organizationId: string): Promise<string> {
  const summary = await getSecuritySummary(userId, organizationId);
  const incidents = await listIncidents(userId, organizationId);
  const lines = ["section,key,value", `summary,members,${summary.members}`, `summary,analyzedMessages,${summary.analyzedMessages}`, `summary,averageSpamScore,${summary.averageSpamScore}`, `summary,openIncidents,${summary.openIncidents}`, `summary,criticalIncidents,${summary.criticalIncidents}`];
  for (const [key, value] of Object.entries(summary.riskSummary)) lines.push(`risk,${key},${value}`);
  for (const incident of incidents) lines.push(["incident", incident.id, incident.title, incident.severity, incident.status].map(csvEscape).join(","));
  return lines.join("\n") + "\n";
}

function pdfEscape(value: string): string { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }

export async function securityPdf(userId: string, organizationId: string): Promise<Buffer> {
  const summary = await getSecuritySummary(userId, organizationId);
  const reportLines = [
    summary.organization.name + " Security Report",
    "Members: " + summary.members + " | Analyzed messages: " + summary.analyzedMessages,
    "Risk: safe " + summary.riskSummary.safe + ", suspicious " + summary.riskSummary.suspicious + ", dangerous " + summary.riskSummary.dangerous + ", blocked " + summary.riskSummary.blocked,
    "Open incidents: " + summary.openIncidents + " | Provider state: NOT_CONFIGURED unless configured",
  ];
  const content = [
    "BT", "/F1 18 Tf", "50 760 Td", "(" + pdfEscape(reportLines[0]) + ") Tj", "/F1 11 Tf", "0 -24 Td",
    "(" + pdfEscape(reportLines[1]) + ") Tj", "0 -18 Td", "(" + pdfEscape(reportLines[2]) + ") Tj", "0 -18 Td", "(" + pdfEscape(reportLines[3]) + ") Tj", "ET",
  ].join("\\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(content) + " >>\\nstream\\n" + content + "\\nendstream",
  ];
  let pdf = "%PDF-1.4\\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += (i + 1) + " 0 obj\\n" + objects[i] + "\\nendobj\\n";
  }
  const xref = Buffer.byteLength(pdf);
  const xrefEntries = offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n ").join("\\n");
  pdf += "xref\\n0 " + (objects.length + 1) + "\\n0000000000 65535 f \\n" + xrefEntries + "\\ntrailer\\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\\nstartxref\\n" + xref + "\\n%%EOF\\n";
  return Buffer.from(pdf, "utf8");
}
