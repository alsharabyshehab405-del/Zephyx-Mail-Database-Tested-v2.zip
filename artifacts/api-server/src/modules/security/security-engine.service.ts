import { and, desc, eq, gte } from "drizzle-orm";
import { db, emailAiPhishingAnalysesTable, emailSecurityFeedbackTable, emailsTable } from "@workspace/db";
import { getAiPhishingAnalysis } from "./ai-phishing.service.js";
import { analyzeIncomingThreat, securityProviderStatus } from "./threat-protection.service.js";
import { attachmentSandboxStatus } from "../../lib/attachment-sandbox.js";
import { urlIntelligenceProviderStatus } from "./url-intelligence-provider.js";
import { getOrganizationAccess } from "../enterprise/enterprise.service.js";

function fail(message: string, statusCode: number): never { throw Object.assign(new Error(message), { statusCode }); }

export async function getUnifiedSecurityEngine(userId: string, emailId: string, organizationId = "personal") {
  const [email] = await db.select().from(emailsTable).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId))).limit(1);
  if (!email) fail("Email not found", 404);
  if (organizationId !== "personal") await getOrganizationAccess(userId, organizationId);
  const local = analyzeIncomingThreat({ fromEmail: email.fromEmail, fromName: email.fromName, subject: email.subject, bodyText: email.bodyText, hasAttachments: Array.isArray(email.attachments) && email.attachments.length > 0 });
  const ai = await getAiPhishingAnalysis(userId, emailId, organizationId);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const scopedAnalyses = organizationId === "personal" ? [] : await db.select({ fromEmail: emailsTable.fromEmail, userId: emailAiPhishingAnalysesTable.userId, verdict: emailAiPhishingAnalysesTable.verdict, analyzedAt: emailAiPhishingAnalysesTable.analyzedAt }).from(emailAiPhishingAnalysesTable).innerJoin(emailsTable, eq(emailsTable.id, emailAiPhishingAnalysesTable.emailId)).where(and(eq(emailAiPhishingAnalysesTable.organizationId, organizationId), gte(emailAiPhishingAnalysesTable.analyzedAt, since)));
  const scopedFeedback = await db.select({ feedbackType: emailSecurityFeedbackTable.feedbackType }).from(emailSecurityFeedbackTable).where(and(eq(emailSecurityFeedbackTable.userId, userId), eq(emailSecurityFeedbackTable.organizationId, organizationId)));
  const senderDomain = email.fromEmail.split("@").pop()?.toLowerCase() ?? "unknown";
  const sameDomainCount = scopedAnalyses.filter((row) => row.fromEmail.split("@").pop()?.toLowerCase() === senderDomain).length;
  const providers = securityProviderStatus();
  return {
    emailId,
    organizationId,
    aiClassification: { state: ai?.verdict ?? "not_configured", result: ai, provider: providers.aiPhishing },
    threatIntelligence: { state: providers.urlIntelligence.state, provider: providers.urlIntelligence.provider },
    urlScanner: { state: "local_heuristics" as const, findings: local.urlFindings },
    attachmentScanner: { clamav: providers.attachmentScanning, policy: "fail_closed" as const, sandbox: attachmentSandboxStatus() },
    senderReputation: { state: "NOT_CONFIGURED" as const, provider: null, reason: "No external sender reputation source is configured; no reputation is invented." },
    campaignSignals: { sameSenderDomainAnalysisCount: sameDomainCount, detected: sameDomainCount >= 2, scope: organizationId === "personal" ? "user" as const : "organization" as const, basis: "locally persisted analyses only" },
    authenticationSignals: { spf: local.spfResult, dkim: local.dkimResult, dmarc: local.dmarcResult, source: local.authenticationSource },
    accountScopedSignals: { feedback: { spam: scopedFeedback.filter((row) => row.feedbackType === "spam").length, notSpam: scopedFeedback.filter((row) => row.feedbackType === "not_spam").length, phishing: scopedFeedback.filter((row) => row.feedbackType === "phishing").length, notPhishing: scopedFeedback.filter((row) => row.feedbackType === "not_phishing").length }, userId },
    riskScoring: { localOverallRisk: local.overallRisk, localSpamScore: local.spamScore, aiRiskScore: ai?.riskScore ?? null, aiCannotBlock: true, inputs: ["local_url_heuristics", "authentication_results", "organization_scoped_campaign_counts", "account_scoped_feedback"] },
    generatedAt: new Date().toISOString(),
  };
}
