import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  auditLogsTable,
  db,
  emailAiPhishingAnalysesTable,
  emailsTable,
  type AiPhishingEvidence,
  type AiPhishingReason,
  type AiPhishingVerdict,
  type EmailAiPhishingAnalysis,
} from "@workspace/db";
import { getOrganizationAccess } from "../enterprise/enterprise.service.js";
import { analyzeIncomingThreat, type ThreatAnalysisResult } from "./threat-protection.service.js";
import { getThreatAnalysisProvider, threatAnalysisProviderStatus, type ThreatAnalysisProviderInput, type ThreatAnalysisProviderResult } from "./threat-analysis-provider.js";

const DEFAULT_RATE_PER_MINUTE = 10;
const DEFAULT_DAILY_INPUT_TOKENS = 300_000;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
const requestState = new Map<string, { minuteStartedAt: number; minuteCount: number; dayStartedAt: number; inputTokens: number }>();
let circuit = { failures: 0, openUntil: 0 };

export type AiPhishingResult = {
  id: string;
  emailId: string;
  organizationId: string;
  userId: string;
  riskScore: number;
  verdict: AiPhishingVerdict;
  reasons: AiPhishingReason[];
  evidence: AiPhishingEvidence[];
  recommendedAction: string;
  provider: string;
  model: string | null;
  analysisVersion: string;
  analyzedAt: string;
};

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function redactedText(value: string | null | undefined, maxLength: number): string {
  return (value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\b\d{12,19}\b/g, "[redacted-number]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(?:password|passwd|passcode|otp|secret|api[- ]?key)\s*[:=]\s*\S+/gi, "$1: [redacted]")
    .replace(/\b(?:sk|ghp|xoxb|AIza)[A-Za-z0-9_-]{10,}\b/g, "[redacted-token]")
    .slice(0, maxLength);
}

function maskedSender(value: string): string {
  const match = value.trim().match(/^([^@]+)@([^@]+)$/);
  if (!match) return "[redacted-sender]";
  return `${match[1]!.slice(0, 1)}***@${match[2]!.toLowerCase()}`;
}

function safeLink(url: string): { url: string; host: string | null; reasons: string[] } {
  try {
    const parsed = new URL(url);
    return { url: `${parsed.protocol}//${parsed.hostname}${parsed.pathname.slice(0, 200)}`, host: parsed.hostname.toLowerCase(), reasons: [] };
  } catch {
    return { url: "[invalid-url]", host: null, reasons: ["invalid_url"] };
  }
}

function senderDomain(value: string): string | null {
  const match = value.trim().match(/@([^@\s>]+)$/);
  return match?.[1]?.toLowerCase().replace(/\.$/, "") ?? null;
}

function impersonationSignals(fromName: string | null | undefined, fromEmail: string, replyTo: string | null | undefined): string[] {
  const signals: string[] = [];
  const name = (fromName ?? "").trim().toLowerCase();
  const domain = senderDomain(fromEmail);
  const brands = ["microsoft", "office 365", "google", "apple", "paypal", "amazon", "ceo", "finance", "security team"];
  const brand = brands.find((item) => name.includes(item));
  if (brand && domain && !domain.includes(brand.replace(/\s+/g, ""))) signals.push("display_name_domain_mismatch");
  if (replyTo && senderDomain(replyTo) && senderDomain(replyTo) !== domain) signals.push("reply_to_domain_mismatch");
  if (domain && /^(gmail|outlook|hotmail|yahoo)\./i.test(domain) && brand) signals.push("brand_using_consumer_mail_domain");
  return Array.from(new Set(signals));
}

function providerInput(email: { subject: string; fromEmail: string; fromName: string | null; bodyText: string; attachments: unknown; locale?: string | null }, local: ThreatAnalysisResult): ThreatAnalysisProviderInput {
  const links = local.urlFindings.map((item) => ({ ...safeLink(item.url), reasons: item.reasons.slice(0, 6) }));
  return {
    subject: redactedText(email.subject, 998),
    senderEmail: maskedSender(email.fromEmail),
    senderName: redactedText(email.fromName, 160) || null,
    senderDomain: senderDomain(email.fromEmail),
    redactedBodyText: redactedText(email.bodyText, 12_000),
    links,
    impersonationSignals: impersonationSignals(email.fromName, email.fromEmail, null),
    locale: email.locale ?? null,
  };
}

function baseRiskScore(local: ThreatAnalysisResult): number {
  const spoofing = local.spoofingRisk === "high" ? 75 : local.spoofingRisk === "medium" ? 45 : 0;
  const urls = local.urlFindings.some((item) => item.verdict === "malicious") ? 85 : local.urlFindings.some((item) => item.verdict === "suspicious") ? 55 : 0;
  return Math.max(local.spamScore, spoofing, urls);
}

function finalVerdict(local: ThreatAnalysisResult, ai: ThreatAnalysisProviderResult): AiPhishingVerdict {
  if (local.overallRisk === "high") return "dangerous";
  if (ai.verdict === "dangerous") return "dangerous";
  if (ai.verdict === "blocked") return "dangerous";
  if (local.overallRisk === "medium" || local.overallRisk === "low" || ai.verdict === "suspicious") return "suspicious";
  return "safe";
}

function resultFromRow(row: EmailAiPhishingAnalysis): AiPhishingResult {
  return {
    id: row.id,
    emailId: row.emailId,
    organizationId: row.organizationId,
    userId: row.userId,
    riskScore: row.riskScore,
    verdict: row.verdict as AiPhishingVerdict,
    reasons: row.reasons,
    evidence: row.evidence,
    recommendedAction: row.recommendedAction,
    provider: row.provider,
    model: row.model,
    analysisVersion: row.analysisVersion,
    analyzedAt: row.analyzedAt.toISOString(),
  };
}

function notConfiguredResult(emailId: string, userId: string, organizationId: string): Omit<AiPhishingResult, "id" | "analyzedAt"> {
  const status = threatAnalysisProviderStatus();
  return {
    emailId,
    userId,
    organizationId,
    riskScore: 0,
    verdict: "not_configured",
    reasons: [{ code: "provider_not_configured", label: "No approved AI phishing provider is configured for this request." }],
    evidence: [],
    recommendedAction: "Ask an administrator to configure and approve an AI phishing provider, or review the message using the built-in security checks.",
    provider: status.provider ?? "none",
    model: status.model,
    analysisVersion: "v1",
  };
}

function consumeBudget(key: string, estimatedInputTokens: number): void {
  const now = Date.now();
  const state = requestState.get(key) ?? { minuteStartedAt: now, minuteCount: 0, dayStartedAt: now, inputTokens: 0 };
  if (now - state.minuteStartedAt >= 60_000) { state.minuteStartedAt = now; state.minuteCount = 0; }
  if (now - state.dayStartedAt >= 86_400_000) { state.dayStartedAt = now; state.inputTokens = 0; }
  const maxPerMinute = intEnv("THREAT_ANALYSIS_RATE_LIMIT_PER_MINUTE", DEFAULT_RATE_PER_MINUTE, 1, 100);
  const maxDailyTokens = intEnv("THREAT_ANALYSIS_MAX_INPUT_TOKENS_PER_DAY", DEFAULT_DAILY_INPUT_TOKENS, 1_000, 10_000_000);
  if (state.minuteCount >= maxPerMinute) fail("AI phishing analysis rate limit reached", 429);
  if (state.inputTokens + estimatedInputTokens > maxDailyTokens) fail("AI phishing analysis daily budget reached", 429);
  state.minuteCount += 1;
  state.inputTokens += estimatedInputTokens;
  requestState.set(key, state);
}

function circuitOpen(): void {
  if (circuit.openUntil > Date.now()) fail("AI phishing provider is temporarily unavailable", 503);
  if (circuit.openUntil !== 0 && circuit.openUntil <= Date.now()) circuit = { failures: 0, openUntil: 0 };
}

function circuitFailure(): void {
  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) circuit.openUntil = Date.now() + CIRCUIT_OPEN_MS;
}

function circuitSuccess(): void { circuit = { failures: 0, openUntil: 0 }; }

async function persist(userId: string, emailId: string, organizationId: string, input: Omit<AiPhishingResult, "id" | "analyzedAt">, tokenUsage: { inputTokens?: number; outputTokens?: number }): Promise<AiPhishingResult> {
  const now = new Date();
  const [row] = await db.insert(emailAiPhishingAnalysesTable).values({
    id: randomUUID(), emailId, userId, organizationId, riskScore: input.riskScore, verdict: input.verdict, reasons: input.reasons, evidence: input.evidence, recommendedAction: input.recommendedAction, provider: input.provider, model: input.model, analysisVersion: input.analysisVersion, inputTokens: tokenUsage.inputTokens ?? null, outputTokens: tokenUsage.outputTokens ?? null, analyzedAt: now, createdAt: now,
  }).onConflictDoUpdate({
    target: [emailAiPhishingAnalysesTable.emailId, emailAiPhishingAnalysesTable.organizationId, emailAiPhishingAnalysesTable.userId],
    set: { riskScore: input.riskScore, verdict: input.verdict, reasons: input.reasons, evidence: input.evidence, recommendedAction: input.recommendedAction, provider: input.provider, model: input.model, analysisVersion: input.analysisVersion, inputTokens: tokenUsage.inputTokens ?? null, outputTokens: tokenUsage.outputTokens ?? null, analyzedAt: now },
  }).returning();
  if (!row) throw new Error("AI phishing analysis could not be persisted");
  return resultFromRow(row);
}

async function assertEmailAccess(userId: string, emailId: string, organizationId: string) {
  const [email] = await db.select().from(emailsTable).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId))).limit(1);
  if (!email) fail("Email not found", 404);
  if (organizationId !== "personal") {
    await getOrganizationAccess(userId, organizationId);
  }
  return email;
}

export async function getAiPhishingAnalysis(userId: string, emailId: string, organizationId = "personal"): Promise<AiPhishingResult | null> {
  await assertEmailAccess(userId, emailId, organizationId);
  const [row] = await db.select().from(emailAiPhishingAnalysesTable).where(and(eq(emailAiPhishingAnalysesTable.userId, userId), eq(emailAiPhishingAnalysesTable.emailId, emailId), eq(emailAiPhishingAnalysesTable.organizationId, organizationId))).orderBy(desc(emailAiPhishingAnalysesTable.analyzedAt)).limit(1);
  return row ? resultFromRow(row) : null;
}

export async function requestAiPhishingAnalysis(userId: string, emailId: string, organizationId = "personal", locale?: string | null): Promise<AiPhishingResult> {
  const email = await assertEmailAccess(userId, emailId, organizationId);
  if (organizationId !== "personal") {
    const access = await getOrganizationAccess(userId, organizationId);
    if (!access.organization.aiPhishingEnabled || !access.organization.aiPhishingConsentAt) {
      const result = await persist(userId, emailId, organizationId, notConfiguredResult(emailId, userId, organizationId), {});
      await db.insert(auditLogsTable).values({ id: randomUUID(), userId, organizationId: organizationId === "personal" ? null : organizationId, action: "ai.phishing.analysis_not_configured", targetType: "email", targetId: emailId, success: true, metadata: { provider: "none", reason: "organization_consent_or_provider_missing" } });
      return result;
    }
  }
  const provider = getThreatAnalysisProvider();
  if (!provider) {
    const result = await persist(userId, emailId, organizationId, notConfiguredResult(emailId, userId, organizationId), {});
    await db.insert(auditLogsTable).values({ id: randomUUID(), userId, organizationId: organizationId === "personal" ? null : organizationId, action: "ai.phishing.analysis_not_configured", targetType: "email", targetId: emailId, success: true, metadata: { provider: "none", reason: "provider_missing" } });
    return result;
  }
  const local = analyzeIncomingThreat({ fromEmail: email.fromEmail, fromName: email.fromName, subject: email.subject, bodyText: email.bodyText, hasAttachments: Array.isArray(email.attachments) && email.attachments.length > 0 });
  const redacted = providerInput({ subject: email.subject, fromEmail: email.fromEmail, fromName: email.fromName, bodyText: email.bodyText, attachments: email.attachments, locale }, local);
  consumeBudget(`${organizationId}:${userId}`, Math.ceil((redacted.redactedBodyText.length + redacted.subject.length + 600) / 4));
  circuitOpen();
  let ai: ThreatAnalysisProviderResult;
  try {
    ai = await provider.analyze(redacted);
    circuitSuccess();
  } catch {
    circuitFailure();
    await db.insert(auditLogsTable).values({ id: randomUUID(), userId, organizationId: organizationId === "personal" ? null : organizationId, action: "ai.phishing.analysis_failed", targetType: "email", targetId: emailId, success: false, metadata: { provider: provider.name, model: provider.model, reason: "provider_unavailable" } });
    fail("AI phishing provider is temporarily unavailable", 503);
  }
  const localEvidence: AiPhishingEvidence[] = [
    ...local.urlFindings.filter((item) => item.verdict !== "safe").slice(0, 4).map((item) => ({ type: "link", summary: `${item.host ?? "unknown-host"}: ${item.reasons.join(", ") || item.verdict}` })),
    ...impersonationSignals(email.fromName, email.fromEmail, null).map((signal) => ({ type: "sender", summary: signal })),
  ];
  const result = await persist(userId, emailId, organizationId, {
    emailId, userId, organizationId, riskScore: Math.max(baseRiskScore(local), ai.riskScore), verdict: finalVerdict(local, ai), reasons: [...local.spamReasons.map((item) => ({ code: item.code, label: item.label })), ...ai.reasons].slice(0, 12), evidence: [...localEvidence, ...ai.evidence].slice(0, 12), recommendedAction: finalVerdict(local, ai) === "safe" ? "You can continue, but verify unexpected requests independently." : finalVerdict(local, ai) === "dangerous" ? "Do not open links, disclose credentials, or send payment." : "Review the sender and links using an independent trusted channel.", provider: provider.name, model: provider.model, analysisVersion: "v1",
  }, { inputTokens: ai.inputTokens, outputTokens: ai.outputTokens });
  await db.insert(auditLogsTable).values({ id: randomUUID(), userId, organizationId: organizationId === "personal" ? null : organizationId, action: "ai.phishing.analysis_completed", targetType: "email", targetId: emailId, success: true, metadata: { provider: provider.name, model: provider.model, verdict: result.verdict, riskScore: result.riskScore } });
  return result;
}
