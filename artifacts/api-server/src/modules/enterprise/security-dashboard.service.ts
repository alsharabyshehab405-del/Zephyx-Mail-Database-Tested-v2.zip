import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, emailAiPhishingAnalysesTable, emailSecurityFeedbackTable, emailsTable, enterprisePoliciesTable, organizationMembersTable, quarantineItemsTable, securityIncidentsTable, threatCampaignsTable, usersTable } from "@workspace/db";
import { getOrganizationAccess, requireRole, type OrganizationRole } from "./enterprise.service.js";

const dashboardRoles = new Set<OrganizationRole>(["owner", "admin", "security_analyst", "auditor"]);

function dayKey(date: Date): string { return date.toISOString().slice(0, 10); }
function domainOf(email: string): string { return email.split("@").pop()?.toLowerCase() ?? "unknown"; }

export async function getOrganizationSecurityDashboard(userId: string, organizationId: string, days = 30) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, dashboardRoles);
  const boundedDays = Number.isFinite(days) ? Math.max(1, Math.min(90, Math.floor(days))) : 30;
  const since = new Date(Date.now() - boundedDays * 86_400_000);
  const members = await db.select({ userId: organizationMembersTable.userId }).from(organizationMembersTable).where(eq(organizationMembersTable.organizationId, organizationId));
  const memberIds = members.map((member) => member.userId);
  const analyses = memberIds.length ? await db.select({ analysis: emailAiPhishingAnalysesTable, email: emailsTable, user: usersTable }).from(emailAiPhishingAnalysesTable).innerJoin(emailsTable, eq(emailsTable.id, emailAiPhishingAnalysesTable.emailId)).innerJoin(usersTable, eq(usersTable.id, emailAiPhishingAnalysesTable.userId)).where(and(eq(emailAiPhishingAnalysesTable.organizationId, organizationId), inArray(emailAiPhishingAnalysesTable.userId, memberIds), eq(emailsTable.userId, emailAiPhishingAnalysesTable.userId))) : [];
  const recent = analyses.filter(({ analysis }) => analysis.analyzedAt >= since);
  const feedbackRows = await db.select({ feedbackType: emailSecurityFeedbackTable.feedbackType }).from(emailSecurityFeedbackTable).where(eq(emailSecurityFeedbackTable.organizationId, organizationId));
  const phishing = recent.filter(({ analysis }) => analysis.verdict === "dangerous" || analysis.verdict === "blocked" || analysis.verdict === "suspicious");
  const domainCounts = new Map<string, number>();
  const userCounts = new Map<string, { userId: string; name: string; count: number }>();
  for (const { analysis, email, user } of phishing) {
    const domain = domainOf(email.fromEmail);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    const existing = userCounts.get(user.id) ?? { userId: user.id, name: user.displayName ?? `${user.firstName} ${user.lastName}`.trim(), count: 0 };
    existing.count += 1;
    userCounts.set(user.id, existing);
  }
  const trends = new Map<string, { phishingAttempts: number; dangerous: number; suspicious: number }>();
  for (let offset = boundedDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86_400_000);
    trends.set(dayKey(date), { phishingAttempts: 0, dangerous: 0, suspicious: 0 });
  }
  for (const { analysis } of recent) {
    const bucket = trends.get(dayKey(analysis.analyzedAt));
    if (!bucket) continue;
    if (analysis.verdict === "dangerous" || analysis.verdict === "blocked" || analysis.verdict === "suspicious") bucket.phishingAttempts += 1;
    if (analysis.verdict === "dangerous" || analysis.verdict === "blocked") bucket.dangerous += 1;
    if (analysis.verdict === "suspicious") bucket.suspicious += 1;
  }
  const [incidents, quarantines, campaigns, policies] = await Promise.all([
    db.select({ id: securityIncidentsTable.id, title: securityIncidentsTable.title, severity: securityIncidentsTable.severity, status: securityIncidentsTable.status, createdAt: securityIncidentsTable.createdAt, updatedAt: securityIncidentsTable.updatedAt }).from(securityIncidentsTable).where(eq(securityIncidentsTable.organizationId, organizationId)).orderBy(desc(securityIncidentsTable.createdAt)).limit(100),
    db.select({ status: quarantineItemsTable.status }).from(quarantineItemsTable).where(eq(quarantineItemsTable.organizationId, organizationId)),
    db.select({ id: threatCampaignsTable.id, label: threatCampaignsTable.label, status: threatCampaignsTable.status, riskScore: threatCampaignsTable.riskScore, messageCount: threatCampaignsTable.messageCount, lastSeenAt: threatCampaignsTable.lastSeenAt }).from(threatCampaignsTable).where(eq(threatCampaignsTable.organizationId, organizationId)).orderBy(desc(threatCampaignsTable.lastSeenAt)).limit(20),
    db.select({ id: enterprisePoliciesTable.id, name: enterprisePoliciesTable.name, enabled: enterprisePoliciesTable.enabled, scope: enterprisePoliciesTable.scope, riskThreshold: enterprisePoliciesTable.riskThreshold }).from(enterprisePoliciesTable).where(eq(enterprisePoliciesTable.organizationId, organizationId)).orderBy(asc(enterprisePoliciesTable.name)),
  ]);
  return {
    organizationId,
    rangeDays: boundedDays,
    phishingAttempts: phishing.length,
    feedback: {
      spam: feedbackRows.filter((row) => row.feedbackType === "spam").length,
      notSpam: feedbackRows.filter((row) => row.feedbackType === "not_spam").length,
      phishing: feedbackRows.filter((row) => row.feedbackType === "phishing").length,
      notPhishing: feedbackRows.filter((row) => row.feedbackType === "not_phishing").length,
    },
    spamCampaigns: Array.from(domainCounts.values()).filter((count) => count >= 2).length,
    persistedCampaigns: campaigns.map((campaign) => ({ ...campaign, lastSeenAt: campaign.lastSeenAt.toISOString() })),
    quarantine: { total: quarantines.length, active: quarantines.filter((item) => item.status === "quarantined" || item.status === "appealed").length, released: quarantines.filter((item) => item.status === "released").length, reported: quarantines.filter((item) => item.status === "reported").length },
    policies: policies.map((policy) => ({ ...policy })),
    topRiskDomains: Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, attempts]) => ({ domain, attempts })),
    mostExposedUsers: Array.from(userCounts.values()).sort((a, b) => b.count - a.count).slice(0, 10),
    trends: Array.from(trends.entries()).map(([date, values]) => ({ date, ...values })),
    incidentTimeline: incidents.map((incident) => ({ id: incident.id, title: incident.title, severity: incident.severity, status: incident.status, createdAt: incident.createdAt.toISOString(), updatedAt: incident.updatedAt.toISOString() })),
    dataScope: "organization_ai_analyses_only",
    generatedAt: new Date().toISOString(),
  };
}
