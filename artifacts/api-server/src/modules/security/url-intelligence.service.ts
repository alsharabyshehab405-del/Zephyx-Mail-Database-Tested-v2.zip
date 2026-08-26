import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { auditLogsTable, db, emailsTable } from "@workspace/db";
import { analyzeIncomingThreat } from "./threat-protection.service.js";
import { getUrlIntelligenceProvider, urlIntelligenceProviderStatus, type UrlIntelligenceFinding } from "./url-intelligence-provider.js";

function fail(message: string, statusCode: number): never { throw Object.assign(new Error(message), { statusCode }); }

function safeUrl(raw: string): { url: string; host: string | null } {
  try {
    const parsed = new URL(raw);
    return { url: `${parsed.protocol}//${parsed.hostname}${parsed.pathname.slice(0, 200)}`, host: parsed.hostname.toLowerCase() };
  } catch { return { url: "[invalid-url]", host: null }; }
}

function brandLookalike(host: string | null): boolean {
  if (!host) return false;
  const normalized = host.toLowerCase();
  return ["micr0soft", "micros0ft", "microsoft-login", "paypa1", "g00gle", "app1e", "amaz0n", "office365-login"].some((brand) => normalized.includes(brand));
}

function displayMismatch(fromName: string | null, fromEmail: string): boolean {
  const name = (fromName ?? "").toLowerCase();
  const domain = fromEmail.split("@").pop()?.toLowerCase() ?? "";
  const brands = ["microsoft", "office 365", "google", "apple", "paypal", "amazon", "security", "finance"];
  return brands.some((brand) => name.includes(brand) && !domain.includes(brand.replace(/\s+/g, "")));
}

async function ownedEmail(userId: string, emailId: string) {
  const [email] = await db.select().from(emailsTable).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId))).limit(1);
  if (!email) fail("Email not found", 404);
  return email;
}

export async function inspectEmailUrls(userId: string, emailId: string) {
  const email = await ownedEmail(userId, emailId);
  const local = analyzeIncomingThreat({ fromEmail: email.fromEmail, fromName: email.fromName, subject: email.subject, bodyText: email.bodyText, hasAttachments: Array.isArray(email.attachments) && email.attachments.length > 0 });
  const urls = local.urlFindings.slice(0, 50).map((finding) => safeUrl(finding.url));
  const provider = getUrlIntelligenceProvider();
  let externalFindings: UrlIntelligenceFinding[] = [];
  if (provider && urls.length) {
    try {
      externalFindings = await provider.analyze({ urls });
    } catch {
      await db.insert(auditLogsTable).values({ id: randomUUID(), userId, organizationId: null, action: "security.url_intelligence.failed", targetType: "email", targetId: emailId, success: false, metadata: { provider: provider.name, reason: "provider_unavailable" } });
      fail("URL intelligence provider is temporarily unavailable", 503);
    }
  }
  const byUrl = new Map(externalFindings.map((finding) => [finding.url, finding]));
  const findings = local.urlFindings.slice(0, 50).map((finding) => {
    const safe = safeUrl(finding.url);
    const external = byUrl.get(safe.url);
    return {
      url: safe.url,
      host: safe.host,
      localVerdict: finding.verdict,
      localReasons: finding.reasons,
      domainAgeDays: external?.domainAgeDays ?? null,
      tlsValid: external?.tlsValid ?? null,
      redirects: external?.redirects ?? [],
      reputation: external?.reputation ?? "unknown",
      flags: [...new Set([...finding.reasons, ...(external?.flags ?? []), ...(brandLookalike(safe.host) ? ["brand_lookalike_domain"] : []), ...(displayMismatch(email.fromName, email.fromEmail) ? ["display_name_domain_mismatch"] : [])])],
    };
  });
  return { provider: urlIntelligenceProviderStatus(), findings, analyzedAt: new Date().toISOString() };
}
