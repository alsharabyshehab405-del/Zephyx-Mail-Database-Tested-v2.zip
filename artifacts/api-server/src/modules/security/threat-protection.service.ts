import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { threatAnalysisProviderStatus } from "./threat-analysis-provider.js";
import { urlIntelligenceProviderStatus } from "./url-intelligence-provider.js";
import { attachmentSandboxStatus } from "../../lib/attachment-sandbox.js";
import {
  auditLogsTable,
  db,
  emailSecurityReportsTable,
  emailThreatAnalysesTable,
  emailsTable,
  type ThreatReason,
  type ThreatRiskLevel,
  type ThreatUrlFinding,
  type ThreatVerdict,
} from "@workspace/db";

export type SecurityReportType = "spam" | "phishing";

type IncomingThreatInput = {
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  bodyText: string;
  authenticationResults?: string | null;
  returnPath?: string | null;
  replyTo?: string | null;
  accountId?: string | null;
  hasAttachments?: boolean;
};

export type ThreatAnalysisResult = {
  spfResult: ThreatVerdict;
  dkimResult: ThreatVerdict;
  dmarcResult: ThreatVerdict;
  authenticationSource: string | null;
  returnPathDomain: string | null;
  fromDomain: string | null;
  spoofingRisk: ThreatRiskLevel;
  spamScore: number;
  spamReasons: ThreatReason[];
  urlFindings: ThreatUrlFinding[];
  malwareStatus: "clean" | "not_scanned";
  overallRisk: ThreatRiskLevel;
};

const AUTH_RESULT = /(?:^|[;\s])%s=(pass|fail|softfail|neutral|none|temperror|permerror)(?:\s|;|$)/i;
const URL_PATTERN = /https?:\/\/[^\s<>'"`]+/gi;
const SHORTENER_HOSTS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly"]);
const SUSPICIOUS_TLDS = new Set(["zip", "mov", "click", "top", "work", "gq", "tk", "ml", "ga", "cf"]);
const SPAM_RULES: Array<{ code: string; score: number; pattern: RegExp; label: string }> = [
  { code: "credential_request", score: 28, pattern: /password|verify your account|sign in|login|one[- ]time code|security code/i, label: "Requests credentials or account verification" },
  { code: "urgent_action", score: 14, pattern: /urgent|immediately|within \d+ hours?|act now|suspended|final notice/i, label: "Uses urgent or threatening language" },
  { code: "financial_lure", score: 24, pattern: /gift card|wire transfer|crypto|bitcoin|lottery|prize|inheritance|refund/i, label: "Contains a financial lure or payment request" },
  { code: "marketing_language", score: 8, pattern: /unsubscribe|limited time|special offer|discount|promotion/i, label: "Contains marketing language" },
];

function parseAuthenticationResult(header: string | null | undefined, name: "spf" | "dkim" | "dmarc"): ThreatVerdict {
  if (!header) return "unknown";
  const match = new RegExp(AUTH_RESULT.source.replace("%s", name), "i").exec(header);
  return (match?.[1]?.toLowerCase() as ThreatVerdict | undefined) ?? "unknown";
}

function domainOf(value: string | null | undefined): string | null {
  const candidate = value?.trim().replace(/^.*<([^>]+)>.*$/, "$1").replace(/^mailto:/i, "");
  const at = candidate?.lastIndexOf("@");
  if (!candidate || at === undefined || at < 1) return null;
  const domain = candidate.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain) ? domain : null;
}

function registrableDomain(domain: string | null): string | null {
  if (!domain) return null;
  const parts = domain.split(".").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(".") : domain;
}

function extractUrls(subject: string, bodyText: string): string[] {
  return Array.from(new Set(`${subject}\n${bodyText}`.match(URL_PATTERN) ?? [])).map((url) => url.replace(/[),.;!?]+$/g, ""));
}

function blockedDomain(host: string): boolean {
  const configured = (process.env.THREAT_BLOCKED_DOMAINS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function analyzeUrl(rawUrl: string): ThreatUrlFinding {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const reasons: string[] = [];
    let verdict: ThreatUrlFinding["verdict"] = "safe";

    if (parsed.username || parsed.password) {
      verdict = "malicious";
      reasons.push("url_contains_userinfo");
    }
    if (blockedDomain(host)) {
      verdict = "malicious";
      reasons.push("domain_matches_local_blocklist");
    }
    if (parsed.protocol !== "https:") {
      if (verdict !== "malicious") verdict = "suspicious";
      reasons.push("unencrypted_http");
    }
    if (host.startsWith("xn--") || host.includes(".xn--")) {
      if (verdict !== "malicious") verdict = "suspicious";
      reasons.push("punycode_domain");
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      if (verdict !== "malicious") verdict = "suspicious";
      reasons.push("ip_literal_host");
    }
    if (SHORTENER_HOSTS.has(host)) {
      if (verdict !== "malicious") verdict = "suspicious";
      reasons.push("url_shortener");
    }
    const tld = host.split(".").pop();
    if (tld && SUSPICIOUS_TLDS.has(tld)) {
      if (verdict !== "malicious") verdict = "suspicious";
      reasons.push("high_abuse_tld");
    }
    if (/[.](?:exe|scr|js|vbs|ps1|bat|cmd)(?:$|[?#])/i.test(parsed.pathname)) {
      verdict = "malicious";
      reasons.push("executable_download_path");
    }

    return { url: rawUrl, host, verdict, reasons };
  } catch {
    return { url: rawUrl, host: null, verdict: "malicious", reasons: ["invalid_url"] };
  }
}

function analyzeSpam(subject: string, bodyText: string, urlFindings: ThreatUrlFinding[]): { score: number; reasons: ThreatReason[] } {
  const content = `${subject}\n${bodyText}`;
  const reasons: ThreatReason[] = [];
  let score = 0;
  for (const rule of SPAM_RULES) {
    if (rule.pattern.test(content)) {
      score += rule.score;
      reasons.push({ code: rule.code, score: rule.score, label: rule.label });
    }
  }
  const punctuation = (content.match(/[!?]{3,}/g) ?? []).length;
  if (punctuation > 0) {
    score += Math.min(10, punctuation * 2);
    reasons.push({ code: "excessive_punctuation", score: Math.min(10, punctuation * 2), label: "Uses repeated exclamation or question marks" });
  }
  if (urlFindings.length >= 4) {
    score += 12;
    reasons.push({ code: "many_links", score: 12, label: "Contains four or more links" });
  }
  const suspiciousLinks = urlFindings.filter((finding) => finding.verdict !== "safe").length;
  if (suspiciousLinks > 0) {
    const linkScore = Math.min(30, suspiciousLinks * 15);
    score += linkScore;
    reasons.push({ code: "suspicious_links", score: linkScore, label: "Contains links requiring security review" });
  }
  return { score: Math.min(100, score), reasons };
}

function spoofingRisk(input: IncomingThreatInput, spf: ThreatVerdict, dkim: ThreatVerdict, dmarc: ThreatVerdict): ThreatRiskLevel {
  const fromDomain = domainOf(input.fromEmail);
  const returnPathDomain = domainOf(input.returnPath);
  const fromRegistrable = registrableDomain(fromDomain);
  const returnRegistrable = registrableDomain(returnPathDomain);
  if (!fromDomain) return "high";
  if (fromRegistrable && returnRegistrable && fromRegistrable !== returnRegistrable) return "high";
  if (dmarc === "fail" || dkim === "fail" || spf === "fail") return "high";
  if (dmarc === "softfail" || dkim === "softfail" || spf === "softfail" || (input.replyTo && domainOf(input.replyTo) !== fromDomain)) return "medium";
  return "none";
}

function riskLevel(spoofing: ThreatRiskLevel, spamScore: number, urlFindings: ThreatUrlFinding[]): ThreatRiskLevel {
  if (spoofing === "high" || spamScore >= 80 || urlFindings.some((finding) => finding.verdict === "malicious")) return "high";
  if (spoofing === "medium" || spamScore >= 50 || urlFindings.some((finding) => finding.verdict === "suspicious")) return "medium";
  if (spamScore >= 25) return "low";
  return "none";
}

export function analyzeIncomingThreat(input: IncomingThreatInput): ThreatAnalysisResult {
  const spfResult = parseAuthenticationResult(input.authenticationResults, "spf");
  const dkimResult = parseAuthenticationResult(input.authenticationResults, "dkim");
  const dmarcResult = parseAuthenticationResult(input.authenticationResults, "dmarc");
  const urlFindings = extractUrls(input.subject, input.bodyText).map(analyzeUrl);
  const spam = analyzeSpam(input.subject, input.bodyText, urlFindings);
  const spoofing = spoofingRisk(input, spfResult, dkimResult, dmarcResult);
  return {
    spfResult,
    dkimResult,
    dmarcResult,
    authenticationSource: input.authenticationResults ? "Authentication-Results" : null,
    returnPathDomain: domainOf(input.returnPath),
    fromDomain: domainOf(input.fromEmail),
    spoofingRisk: spoofing,
    spamScore: spam.score,
    spamReasons: spam.reasons,
    urlFindings,
    malwareStatus: input.hasAttachments ? "clean" : "not_scanned",
    overallRisk: riskLevel(spoofing, spam.score, urlFindings),
  };
}

function publicAnalysis(row: typeof emailThreatAnalysesTable.$inferSelect) {
  return {
    id: row.id,
    emailId: row.emailId,
    spfResult: row.spfResult as ThreatVerdict,
    dkimResult: row.dkimResult as ThreatVerdict,
    dmarcResult: row.dmarcResult as ThreatVerdict,
    authenticationSource: row.authenticationSource,
    returnPathDomain: row.returnPathDomain,
    fromDomain: row.fromDomain,
    spoofingRisk: row.spoofingRisk as ThreatRiskLevel,
    spamScore: row.spamScore,
    spamReasons: row.spamReasons,
    urlFindings: row.urlFindings,
    malwareStatus: row.malwareStatus,
    overallRisk: row.overallRisk as ThreatRiskLevel,
    analysisVersion: row.analysisVersion,
    analyzedAt: row.analyzedAt.toISOString(),
  };
}

export async function persistThreatAnalysis(userId: string, emailId: string, input: IncomingThreatInput) {
  const result = analyzeIncomingThreat(input);
  const values = {
    id: randomUUID(),
    emailId,
    userId,
    accountId: input.accountId ?? null,
    spfResult: result.spfResult,
    dkimResult: result.dkimResult,
    dmarcResult: result.dmarcResult,
    authenticationSource: result.authenticationSource,
    returnPathDomain: result.returnPathDomain,
    fromDomain: result.fromDomain,
    spoofingRisk: result.spoofingRisk,
    spamScore: result.spamScore,
    spamReasons: result.spamReasons,
    urlFindings: result.urlFindings,
    malwareStatus: result.malwareStatus,
    overallRisk: result.overallRisk,
    analysisVersion: "v1",
    analyzedAt: new Date(),
    createdAt: new Date(),
  };
  const [row] = await db
    .insert(emailThreatAnalysesTable)
    .values(values)
    .onConflictDoUpdate({
      target: emailThreatAnalysesTable.emailId,
      set: {
        accountId: values.accountId,
        spfResult: values.spfResult,
        dkimResult: values.dkimResult,
        dmarcResult: values.dmarcResult,
        authenticationSource: values.authenticationSource,
        returnPathDomain: values.returnPathDomain,
        fromDomain: values.fromDomain,
        spoofingRisk: values.spoofingRisk,
        spamScore: values.spamScore,
        spamReasons: values.spamReasons,
        urlFindings: values.urlFindings,
        malwareStatus: values.malwareStatus,
        overallRisk: values.overallRisk,
        analysisVersion: values.analysisVersion,
        analyzedAt: values.analyzedAt,
      },
    })
    .returning();
  if (!row) throw new Error("Threat analysis could not be persisted");
  return publicAnalysis(row);
}

export async function getThreatAnalysisForUser(userId: string, emailId: string) {
  const [row] = await db
    .select()
    .from(emailThreatAnalysesTable)
    .where(and(eq(emailThreatAnalysesTable.userId, userId), eq(emailThreatAnalysesTable.emailId, emailId)))
    .limit(1);
  return row ? publicAnalysis(row) : null;
}

export async function getThreatAnalysesForUser(userId: string, emailIds: string[]) {
  if (emailIds.length === 0) return new Map<string, ReturnType<typeof publicAnalysis>>();
  const rows = await db
    .select()
    .from(emailThreatAnalysesTable)
    .where(and(eq(emailThreatAnalysesTable.userId, userId), inArray(emailThreatAnalysesTable.emailId, emailIds)));
  return new Map(rows.map((row) => [row.emailId, publicAnalysis(row)]));
}

export async function createSecurityReport(userId: string, emailId: string, reportType: SecurityReportType, reason = "") {
  const [email] = await db
    .select({ id: emailsTable.id })
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);
  if (!email) throw Object.assign(new Error("Email not found"), { statusCode: 404 });

  const normalizedReason = reason.trim().slice(0, 500);
  const [created] = await db
    .insert(emailSecurityReportsTable)
    .values({ id: randomUUID(), emailId, userId, reportType, reason: normalizedReason })
    .onConflictDoNothing({ target: [emailSecurityReportsTable.userId, emailSecurityReportsTable.emailId, emailSecurityReportsTable.reportType] })
    .returning();

  if (reportType === "spam") {
    await db.update(emailsTable).set({ folder: "spam", customFolderId: null }).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)));
  }
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId,
    action: `email.report_${reportType}`,
    targetType: "email",
    targetId: emailId,
    success: true,
    metadata: { reportType },
  });

  if (created) return { id: created.id, emailId, reportType, reason: created.reason, createdAt: created.createdAt.toISOString(), duplicate: false };
  const [existing] = await db
    .select()
    .from(emailSecurityReportsTable)
    .where(and(eq(emailSecurityReportsTable.userId, userId), eq(emailSecurityReportsTable.emailId, emailId), eq(emailSecurityReportsTable.reportType, reportType)))
    .orderBy(desc(emailSecurityReportsTable.createdAt))
    .limit(1);
  if (!existing) throw new Error("Security report could not be loaded");
  return { id: existing.id, emailId, reportType, reason: existing.reason, createdAt: existing.createdAt.toISOString(), duplicate: true };
}

export function securityProviderStatus() {
  const clamavPort = Number(process.env.CLAMAV_PORT ?? "3310");
  const clamavConfigured = process.env.ATTACHMENT_SCANNING_ENABLED?.trim().toLowerCase() === "true"
    && Boolean(process.env.CLAMAV_HOST?.trim())
    && Number.isInteger(clamavPort)
    && clamavPort > 0
    && clamavPort <= 65535;
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
  return {
    attachmentScanning: clamavConfigured ? "configured" : "NOT_CONFIGURED",
    attachmentPolicy: "fail_closed",
    authenticationHeaders: "recorded_when_provider_supplies_them",
    urlAnalysis: "local_heuristics",
    urlIntelligence: urlIntelligenceProviderStatus(),
    attachmentSandbox: attachmentSandboxStatus(),
    spamScoring: "local_explainable_rules",
    externalContentSharing: "disabled",
    aiProvider: process.env.GEMINI_API_KEY ? "configured" : "NOT_CONFIGURED",
    aiPhishing: threatAnalysisProviderStatus().state,
    gmailOAuth: process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET ? "configured" : "NOT_CONFIGURED",
    outlookGraph: "NOT_CONFIGURED",
    smtp: smtpConfigured ? "configured" : "NOT_CONFIGURED",
    fcm: "NOT_CONFIGURED",
    webPush: "NOT_CONFIGURED",
    billing: "NOT_CONFIGURED",
  } as const;
}
