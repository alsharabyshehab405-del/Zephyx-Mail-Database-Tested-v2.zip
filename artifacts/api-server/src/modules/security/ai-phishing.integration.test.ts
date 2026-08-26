import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { and, eq } from "drizzle-orm";
import { auditLogsTable, db, emailAiPhishingAnalysesTable, emailSecurityFeedbackTable, emailsTable, organizationMembersTable, organizationsTable, pool, type EmailAttachment } from "@workspace/db";

const runId = `ai-${Date.now()}`;
const aliceEmail = `alice-${runId}@example.test`;
const bobEmail = `bob-${runId}@example.test`;
const password = "AiTestPass_123!";
let aliceToken = "";
let bobToken = "";
let aliceId = "";
let bobId = "";
let orgA = "";
let orgB = "";
const emailIds: string[] = [];

async function createEmail(input: { subject: string; fromEmail: string; fromName?: string | null; bodyText: string; attachments?: EmailAttachment[] }) {
  const id = crypto.randomUUID();
  await db.insert(emailsTable).values({ id, userId: aliceId, subject: input.subject, fromEmail: input.fromEmail, fromName: input.fromName ?? null, bodyText: input.bodyText, bodyHtml: `<p>${input.bodyText}</p>`, attachments: input.attachments ?? [], folder: "inbox", status: "sent" });
  emailIds.push(id);
  return id;
}

function providerResponse(result: { riskScore: number; verdict: "safe" | "suspicious" | "dangerous" | "blocked"; reason: string }) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ riskScore: result.riskScore, verdict: result.verdict, reasons: [{ code: result.verdict, label: result.reason }], evidence: [{ type: "message", summary: result.reason }], recommendedAction: result.verdict === "safe" ? "Continue normally." : "Verify the request independently." }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.THREAT_ANALYSIS_PROVIDER;
  delete process.env.THREAT_ANALYSIS_API_URL;
  delete process.env.THREAT_ANALYSIS_API_KEY;
  delete process.env.THREAT_ANALYSIS_MODEL;
  delete process.env.THREAT_ANALYSIS_MAX_RETRIES;
});

describe("AI phishing detection integration", () => {
  beforeAll(async () => {
    const alice = await request(app).post("/api/auth/register").send({ email: aliceEmail, password, firstName: "Alice", lastName: runId });
    const bob = await request(app).post("/api/auth/register").send({ email: bobEmail, password, firstName: "Bob", lastName: runId });
    expect(alice.status).toBe(201);
    expect(bob.status).toBe(201);
    aliceToken = alice.body.accessToken;
    bobToken = bob.body.accessToken;
    aliceId = alice.body.user.id;
    bobId = bob.body.user.id;
    orgA = crypto.randomUUID();
    orgB = crypto.randomUUID();
    await db.insert(organizationsTable).values([{ id: orgA, name: `AI Org A ${runId}`, slug: `ai-org-a-${Date.now()}`, createdBy: aliceId, aiPhishingEnabled: true, aiPhishingConsentAt: new Date() }, { id: orgB, name: `AI Org B ${runId}`, slug: `ai-org-b-${Date.now()}`, createdBy: aliceId }]);
    await db.insert(organizationMembersTable).values([{ organizationId: orgA, userId: aliceId, role: "owner" }, { organizationId: orgA, userId: bobId, role: "member" }, { organizationId: orgB, userId: aliceId, role: "owner" }]);
  });

  afterAll(async () => {
    if (emailIds.length) await db.delete(emailAiPhishingAnalysesTable).where(and(eq(emailAiPhishingAnalysesTable.userId, aliceId), eq(emailAiPhishingAnalysesTable.organizationId, orgA)));
    await pool.end();
  });

  it("returns and stores an explicit NOT_CONFIGURED result without contacting an AI provider", async () => {
    const emailId = await createEmail({ subject: "Unconfigured provider", fromEmail: "sender@example.test", bodyText: "Review this message." });
    const response = await request(app).post(`/api/security/emails/${emailId}/ai-phishing`).set("Authorization", `Bearer ${aliceToken}`).set("X-Organization-Id", orgA).send({ locale: "en" });
    expect(response.status).toBe(200);
    expect(response.body.analysis.verdict).toBe("not_configured");
    expect(response.body.analysis.provider).toBe("none");
    const [row] = await db.select().from(emailAiPhishingAnalysesTable).where(and(eq(emailAiPhishingAnalysesTable.emailId, emailId), eq(emailAiPhishingAnalysesTable.organizationId, orgA)));
    expect(row?.reasons[0]?.code).toBe("provider_not_configured");
  });

  it("requires owner/admin consent to change organization AI phishing state", async () => {
    const denied = await request(app).patch(`/api/enterprise/${orgA}/ai-phishing`).set("Authorization", `Bearer ${bobToken}`).send({ enabled: true });
    expect(denied.status).toBe(403);
    const disabled = await request(app).patch(`/api/enterprise/${orgA}/ai-phishing`).set("Authorization", `Bearer ${aliceToken}`).send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.enabled).toBe(false);
    const enabled = await request(app).patch(`/api/enterprise/${orgA}/ai-phishing`).set("Authorization", `Bearer ${aliceToken}`).send({ enabled: true });
    expect(enabled.status).toBe(200);
    expect(enabled.body.enabled).toBe(true);
  });

  it("enforces user and organization isolation for stored analysis", async () => {
    const emailId = await createEmail({ subject: "Isolation fixture", fromEmail: "sender@example.test", bodyText: "Private message." });
    const bobResponse = await request(app).get(`/api/security/emails/${emailId}/ai-phishing`).set("Authorization", `Bearer ${bobToken}`).set("X-Organization-Id", orgA);
    const wrongOrganization = await request(app).get(`/api/security/emails/${emailId}/ai-phishing`).set("Authorization", `Bearer ${aliceToken}`).set("X-Organization-Id", orgB);
    expect(bobResponse.status).toBe(404);
    expect(wrongOrganization.status).toBe(200);
    expect(wrongOrganization.body.analysis).toBeNull();
    const unauthorizedOrganization = await request(app).get(`/api/security/emails/${emailId}/ai-phishing`).set("Authorization", `Bearer ${bobToken}`).set("X-Organization-Id", orgB);
    expect(unauthorizedOrganization.status).toBe(404);
  });

  it("handles Microsoft impersonation, suspicious login links, domain mismatch, and clean mail without allowing AI to lower local risk", async () => {
    process.env.THREAT_ANALYSIS_PROVIDER = "approved-test-provider";
    process.env.THREAT_ANALYSIS_API_URL = "https://provider.example.test/v1/chat/completions";
    process.env.THREAT_ANALYSIS_API_KEY = "test-only-key";
    process.env.THREAT_ANALYSIS_MODEL = "test-model";
    process.env.THREAT_ANALYSIS_MAX_RETRIES = "0";
    const calls = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      expect(body).not.toContain("attachment-secret");
      if (body.includes("Microsoft Account")) return providerResponse({ riskScore: 92, verdict: "dangerous", reason: "The sender impersonates Microsoft." });
      if (body.includes("login")) return providerResponse({ riskScore: 72, verdict: "suspicious", reason: "The message asks the recipient to use a login link." });
      if (body.includes("Finance Director")) return providerResponse({ riskScore: 68, verdict: "suspicious", reason: "The display name and sender domain do not align." });
      if (body.includes("AI-only block")) return providerResponse({ riskScore: 99, verdict: "blocked", reason: "AI requested a block without a deterministic local block." });
      return providerResponse({ riskScore: 4, verdict: "safe", reason: "No reliable phishing signal was found." });
    });
    vi.stubGlobal("fetch", calls);
    const microsoftId = await createEmail({ subject: "Microsoft Account", fromEmail: "notice@evil.test", fromName: "Microsoft Support", bodyText: "Urgent account review.", attachments: [{ filename: "attachment-secret.txt", url: "opaque", size: 10, mimeType: "text/plain" }] });
    const loginId = await createEmail({ subject: "Please login", fromEmail: "alerts@evil.test", bodyText: "Please login at https://evil.test/login" });
    const mismatchId = await createEmail({ subject: "Invoice request", fromEmail: "director@lookalike.test", fromName: "Finance Director", bodyText: "Please review this invoice." });
    const cleanId = await createEmail({ subject: "Weekly project update", fromEmail: "colleague@example.test", fromName: "Colleague", bodyText: "The project update is attached for our next meeting." });
    const aiOnlyBlockId = await createEmail({ subject: "AI-only block", fromEmail: "colleague@example.test", fromName: "Colleague", bodyText: "A normal message with no local block signal." });
    const headers = { Authorization: `Bearer ${aliceToken}`, "X-Organization-Id": orgA };
    const microsoft = await request(app).post(`/api/security/emails/${microsoftId}/ai-phishing`).set(headers).send({ locale: "en" });
    const login = await request(app).post(`/api/security/emails/${loginId}/ai-phishing`).set(headers).send({ locale: "en" });
    const mismatch = await request(app).post(`/api/security/emails/${mismatchId}/ai-phishing`).set(headers).send({ locale: "en" });
    const clean = await request(app).post(`/api/security/emails/${cleanId}/ai-phishing`).set(headers).send({ locale: "en" });
    const aiOnlyBlock = await request(app).post(`/api/security/emails/${aiOnlyBlockId}/ai-phishing`).set(headers).send({ locale: "en" });
    expect(microsoft.status).toBe(200);
    expect(microsoft.body.analysis.verdict).toBe("dangerous");
    expect(login.body.analysis.verdict).toBe("suspicious");
    expect(mismatch.body.analysis.verdict).toBe("suspicious");
    expect(clean.body.analysis.verdict).toBe("safe");
    expect(aiOnlyBlock.body.analysis.verdict).toBe("dangerous");
    expect(aiOnlyBlock.body.analysis.verdict).not.toBe("blocked");
    expect(calls).toHaveBeenCalledTimes(5);
  });

  it("exposes unified engine and explicit NOT_CONFIGURED URL intelligence without external facts", async () => {
    const emailId = await createEmail({ subject: "Microsoft login", fromEmail: "alerts@evil.test", fromName: "Microsoft Support", bodyText: "Visit https://micr0soft-login.com/verify" });
    const engine = await request(app).get(`/api/security/emails/${emailId}/security-engine`).set("Authorization", `Bearer ${aliceToken}`).set("X-Organization-Id", orgA);
    expect(engine.status).toBe(200);
    expect(engine.body.aiClassification.state).toBe("not_configured");
    expect(engine.body.riskScoring.aiCannotBlock).toBe(true);
    const urls = await request(app).get(`/api/security/emails/${emailId}/url-intelligence`).set("Authorization", `Bearer ${aliceToken}`);
    expect(urls.status).toBe(200);
    expect(urls.body.provider.state).toBe("NOT_CONFIGURED");
    expect(urls.body.findings[0]).toMatchObject({ domainAgeDays: null, tlsValid: null, reputation: "unknown" });
    expect(urls.body.findings[0].flags).toContain("display_name_domain_mismatch");
    expect(urls.body.findings[0].flags).toContain("brand_lookalike_domain");
    expect(urls.body.findings[0].domainAgeDays).toBeNull();
    expect(urls.body.findings[0].tlsValid).toBeNull();
    expect(engine.body.senderReputation).toMatchObject({ state: "NOT_CONFIGURED", provider: null });
    expect(engine.body.campaignSignals.detected).toBe(true);
    expect(engine.body.campaignSignals.scope).toBe("organization");
    expect(engine.body.accountScopedSignals.feedback).toEqual({ spam: 0, notSpam: 0, phishing: 0, notPhishing: 0 });
  });

  it("stores feedback in user and organization scope and prevents outsider access", async () => {
    const emailId = await createEmail({ subject: "Feedback fixture", fromEmail: "sender@example.test", bodyText: "A reviewable message." });
    const saved = await request(app).post(`/api/security/emails/${emailId}/security-feedback`).set("Authorization", `Bearer ${aliceToken}`).set("X-Organization-Id", orgA).send({ feedbackType: "phishing" });
    expect(saved.status).toBe(200);
    expect(saved.body.feedback).toMatchObject({ emailId, organizationId: orgA, feedbackType: "phishing", learningScope: "organization" });
    const own = await request(app).get(`/api/security/emails/${emailId}/security-feedback`).set("Authorization", `Bearer ${aliceToken}`).set("X-Organization-Id", orgA);
    expect(own.body.feedback.feedbackType).toBe("phishing");
    const outsider = await request(app).get(`/api/security/emails/${emailId}/security-feedback`).set("Authorization", `Bearer ${bobToken}`).set("X-Organization-Id", orgA);
    expect(outsider.status).toBe(404);
    const persisted = await db.select().from(emailSecurityFeedbackTable).where(and(eq(emailSecurityFeedbackTable.emailId, emailId), eq(emailSecurityFeedbackTable.organizationId, orgA)));
    expect(persisted).toHaveLength(1);
  });

  it("keeps dashboard and assistant data organization-scoped and reports missing provider honestly", async () => {
    const dashboard = await request(app).get(`/api/enterprise/${orgA}/security-dashboard?days=30`).set("Authorization", `Bearer ${aliceToken}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.dataScope).toBe("organization_ai_analyses_only");
    expect(dashboard.body.phishingAttempts).toBeGreaterThan(0);
    expect(dashboard.body.feedback).toMatchObject({ phishing: 1 });
    const otherDashboard = await request(app).get(`/api/enterprise/${orgB}/security-dashboard`).set("Authorization", `Bearer ${aliceToken}`);
    expect(otherDashboard.status).toBe(200);
    expect(otherDashboard.body.phishingAttempts).toBe(0);
    const assistant = await request(app).post(`/api/enterprise/${orgA}/security-assistant`).set("Authorization", `Bearer ${aliceToken}`).send({ question: "What needs attention?", locale: "en" });
    expect(assistant.status).toBe(200);
    expect(assistant.body.state).toBe("NOT_CONFIGURED");
    expect(assistant.body.answer).toBeNull();
    expect(assistant.body.dataScope).toBe("organization_only");
  });

  it("returns 503 on provider failure and does not log message content", async () => {
    process.env.THREAT_ANALYSIS_PROVIDER = "approved-test-provider";
    process.env.THREAT_ANALYSIS_API_URL = "https://provider.example.test/v1/chat/completions";
    process.env.THREAT_ANALYSIS_API_KEY = "test-only-key";
    process.env.THREAT_ANALYSIS_MAX_RETRIES = "0";
    const emailId = await createEmail({ subject: "Secret body fixture", fromEmail: "sender@example.test", bodyText: "raw-private-body attachment-secret" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("provider timeout"); }));
    const response = await request(app).post(`/api/security/emails/${emailId}/ai-phishing`).set("Authorization", `Bearer ${aliceToken}`).set("X-Organization-Id", orgA).send({ locale: "en" });
    expect(response.status).toBe(503);
    const logs = await db.select({ metadata: auditLogsTable.metadata }).from(auditLogsTable).where(and(eq(auditLogsTable.targetId, emailId), eq(auditLogsTable.action, "ai.phishing.analysis_failed")));
    expect(JSON.stringify(logs)).not.toContain("raw-private-body");
    expect(JSON.stringify(logs)).not.toContain("attachment-secret");
  });
});
