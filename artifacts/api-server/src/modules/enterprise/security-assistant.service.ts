import { getThreatAnalysisProvider, threatAnalysisProviderStatus } from "../security/threat-analysis-provider.js";
import { getOrganizationSecurityDashboard } from "./security-dashboard.service.js";
import { getOrganizationAccess, requireRole, type OrganizationRole } from "./enterprise.service.js";

const assistantRoles = new Set<OrganizationRole>(["owner", "admin", "security_analyst", "auditor"]);
const requestState = new Map<string, { startedAt: number; count: number }>();

function fail(message: string, statusCode: number): never { throw Object.assign(new Error(message), { statusCode }); }
function consume(userId: string, organizationId: string) {
  const now = Date.now();
  const key = `${organizationId}:${userId}`;
  const state = requestState.get(key) ?? { startedAt: now, count: 0 };
  if (now - state.startedAt >= 60_000) { state.startedAt = now; state.count = 0; }
  const limit = Number.parseInt(process.env.THREAT_ANALYSIS_ASSISTANT_RATE_LIMIT_PER_MINUTE ?? "10", 10);
  if (state.count >= (Number.isInteger(limit) ? Math.max(1, Math.min(30, limit)) : 10)) fail("Security assistant rate limit reached", 429);
  state.count += 1;
  requestState.set(key, state);
}

export async function askOrganizationSecurityAssistant(userId: string, organizationId: string, question: string, locale?: string | null, days = 30) {
  const access = await getOrganizationAccess(userId, organizationId);
  requireRole(access.membership.role, assistantRoles);
  const normalizedQuestion = question.trim().slice(0, 500);
  if (!normalizedQuestion) fail("A security question is required", 400);
  consume(userId, organizationId);
  const dashboard = await getOrganizationSecurityDashboard(userId, organizationId, days);
  const provider = getThreatAnalysisProvider();
  const providerStatus = threatAnalysisProviderStatus();
  if (!provider?.assist) {
    return { state: "NOT_CONFIGURED" as const, provider: providerStatus, answer: null, keyPoints: [], data: dashboard, dataScope: "organization_only" as const };
  }
  try {
    const response = await provider.assist({
      question: normalizedQuestion,
      organizationSummary: {
        rangeDays: dashboard.rangeDays,
        phishingAttempts: dashboard.phishingAttempts,
        spamCampaigns: dashboard.spamCampaigns,
        topRiskDomains: dashboard.topRiskDomains,
        mostExposedUsers: dashboard.mostExposedUsers,
        trends: dashboard.trends,
        incidentTimeline: dashboard.incidentTimeline,
      },
      locale,
    });
    return { state: "CONFIGURED" as const, provider: providerStatus, answer: response.answer, keyPoints: response.keyPoints, data: dashboard, dataScope: "organization_only" as const };
  } catch {
    fail("Security assistant provider is temporarily unavailable", 503);
  }
}
