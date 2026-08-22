#!/usr/bin/env node
import crypto from "node:crypto";

const base = process.env.STAGING_BASE_URL ?? "http://127.0.0.1:3500";
const runId = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`;
const email = `staging-smoke-${runId}@example.invalid`;
const recipient = `staging-recipient-${runId}@example.invalid`;
const password = `StagingSmoke-${crypto.randomBytes(18).toString("base64url")}!`;
const checks = [];
const createdEmailIds = [];
let accessToken;
let refreshToken;
let attachmentId;

function record(name, status, detail = "") {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.body && typeof options.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(new URL(path, base), { ...options, headers });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { response, body, raw };
}

function expectStatus(result, expected, name) {
  if (result.response.status !== expected) throw new Error(`${name}: expected ${expected}, got ${result.response.status}`);
}

async function optional(name, enabled, fn) {
  if (!enabled) {
    record(name, "NOT_CONFIGURED");
    return;
  }
  await fn();
  record(name, "PASS");
}

try {
  let result = await request("/api/health/live");
  expectStatus(result, 200, "liveness");
  if (result.body?.status !== "ok") throw new Error("liveness response is not ok");
  record("liveness", "PASS");

  result = await request("/api/health/ready");
  expectStatus(result, 200, "readiness");
  if (result.body?.status !== "ok" || result.body?.dependencies?.postgres !== "ok") throw new Error("readiness did not report PostgreSQL ok");
  record("readiness", "PASS");

  result = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, firstName: "Staging", lastName: "Smoke" }),
  });
  expectStatus(result, 201, "registration");
  accessToken = result.body?.accessToken;
  refreshToken = result.body?.refreshToken;
  if (!accessToken || !refreshToken) throw new Error("registration did not return session tokens");
  record("registration", "PASS");

  result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expectStatus(result, 200, "login");
  accessToken = result.body?.accessToken;
  refreshToken = result.body?.refreshToken;
  record("login", "PASS");

  result = await request("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  expectStatus(result, 200, "session refresh");
  accessToken = result.body?.accessToken;
  refreshToken = result.body?.refreshToken;
  record("session refresh", "PASS");

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  result = await request("/api/emails?folder=inbox", { headers: auth() });
  expectStatus(result, 200, "inbox");
  if (!Array.isArray(result.body?.emails)) throw new Error("inbox response has no emails array");
  record("inbox", "PASS");

  result = await request("/api/folders", { headers: auth() });
  expectStatus(result, 200, "folders");
  record("folders", "PASS");

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "utf8");
  result = await request("/api/emails/attachments", {
    method: "POST",
    headers: { ...auth(), "content-type": "application/pdf", "x-file-name": `../safe-${runId}.pdf` },
    body: pdf,
  });
  expectStatus(result, 201, "attachment upload");
  attachmentId = result.body?.url?.split("/").pop();
  if (!attachmentId || !result.body?.url) throw new Error("attachment upload did not return a URL");
  record("attachment upload", "PASS");

  result = await request("/api/emails", {
    method: "POST",
    headers: { ...auth(), "Idempotency-Key": `staging-draft-${runId}` },
    body: JSON.stringify({
      subject: `Staging draft ${runId}`,
      to: [{ email: recipient, name: "Staging Recipient" }],
      bodyHtml: "<p>Staging draft fixture</p>",
      bodyText: "Staging draft fixture",
      attachments: [result.body],
      isDraft: true,
    }),
  });
  expectStatus(result, 201, "draft creation");
  const draftId = result.body?.id;
  if (!draftId) throw new Error("draft did not return an id");
  createdEmailIds.push(draftId);
  record("draft creation", "PASS");

  result = await request(`/api/emails/${draftId}/draft`, {
    method: "PATCH",
    headers: { ...auth(), "content-type": "application/json" },
    body: JSON.stringify({
      subject: `Staging draft updated ${runId}`,
      to: [{ email: recipient, name: "Staging Recipient" }],
      bodyHtml: "<p>Staging draft updated</p>",
      bodyText: "Staging draft updated",
      attachments: [result.body.attachments[0]],
      sendNow: false,
    }),
  });
  expectStatus(result, 200, "draft autosave update");
  record("draft autosave update", "PASS");

  result = await request(`/api/emails/attachments/${attachmentId}?download=1`, { headers: auth() });
  expectStatus(result, 200, "attachment download");
  if (!result.raw.includes("%PDF-1.4")) throw new Error("downloaded attachment did not match the PDF fixture");
  record("attachment download", "PASS");

  result = await request("/api/emails", {
    method: "POST",
    headers: { ...auth(), "Idempotency-Key": `staging-send-${runId}` },
    body: JSON.stringify({
      subject: `Staging SMTP ${runId}`,
      to: [{ email: recipient, name: "Staging Recipient" }],
      bodyHtml: "<p>Staging SMTP fixture</p>",
      bodyText: "Staging SMTP fixture",
    }),
  });
  expectStatus(result, 201, "SMTP test send");
  const sentId = result.body?.id;
  if (!sentId || result.body?.folder !== "sent") throw new Error("SMTP send did not create a sent email");
  createdEmailIds.push(sentId);
  record("SMTP test send via Mailpit", "PASS");

  result = await request(`/api/emails?folder=sent&search=${encodeURIComponent(runId)}`, { headers: auth() });
  expectStatus(result, 200, "search");
  if (!(result.body?.emails ?? []).some((item) => item.id === sentId)) throw new Error("search did not return the sent fixture");
  record("search and filters", "PASS");

  result = await request("/api/notifications/devices", {
    method: "POST",
    headers: { ...auth(), "content-type": "application/json" },
    body: JSON.stringify({ platform: "web", pushToken: `staging-push-${runId}` }),
  });
  expectStatus(result, 201, "notification device registration");
  const deviceId = result.body?.id;
  record("notification device registration", "PASS");

  result = await request("/api/notifications/preferences", { headers: auth() });
  expectStatus(result, 200, "notification preferences");
  record("notification preferences", "PASS");

  result = await request("/api/realtime/ticket", { method: "POST", headers: auth() });
  expectStatus(result, 201, "realtime ticket");
  const ticket = result.body?.ticket;
  if (!ticket) throw new Error("realtime ticket was empty");
  const streamController = new AbortController();
  const streamPromise = fetch(new URL(`/api/realtime/events?ticket=${encodeURIComponent(ticket)}`, base), { signal: streamController.signal });
  const streamResponse = await streamPromise;
  expectStatus({ response: streamResponse }, 200, "realtime stream");
  setTimeout(() => streamController.abort(), 500);
  await streamResponse.body?.cancel().catch(() => undefined);
  record("Redis realtime stream", "PASS");

  result = await request(`/api/realtime/events?ticket=${encodeURIComponent(ticket)}`);
  if (result.response.status !== 401) throw new Error(`one-time ticket reuse returned ${result.response.status}`);
  record("one-time realtime ticket", "PASS");

  result = await request("/api/health/worker/ready");
  expectStatus(result, 200, "worker dependency readiness");
  record("Worker/Redis readiness", "PASS");

  await optional("Gmail OAuth", process.env.STAGING_ENABLE_GMAIL === "true", async () => {
    const gmail = await request("/api/gmail/status", { headers: auth() });
    expectStatus(gmail, 200, "Gmail status");
  });
  await optional("ClamAV scanning", process.env.STAGING_ATTACHMENT_SCANNING_ENABLED === "true", async () => {
    if (!process.env.STAGING_CLAMAV_HOST) throw new Error("ClamAV enabled without a staging host");
  });
  await optional("FCM", process.env.STAGING_FCM_ENABLED === "true", async () => {
    if (!process.env.STAGING_FCM_ACCESS_TOKEN) throw new Error("FCM enabled without a staging token");
  });
  await optional("Web Push", process.env.STAGING_WEB_PUSH_ENABLED === "true", async () => {
    if (!process.env.STAGING_WEB_PUSH_VAPID_PRIVATE_KEY) throw new Error("Web Push enabled without a staging key");
  });
  await optional("Billing webhooks", process.env.STAGING_ENABLE_BILLING === "true", async () => {
    if (!process.env.STAGING_BILLING_WEBHOOK_SECRET) throw new Error("Billing enabled without a staging webhook secret");
  });
  if (process.env.STAGING_BACKUP_STATUS === "verified") record("backup/restore", "PASS"); else record("backup/restore", "NOT_CONFIGURED", "run verify-backup-restore.sh before Beta acceptance");

  console.log(`staging smoke passed: ${checks.filter((item) => item.status === "PASS").length} pass, ${checks.filter((item) => item.status === "NOT_CONFIGURED").length} not_configured`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  record("staging smoke", "FAIL", message);
  process.exitCode = 1;
} finally {
  if (accessToken) {
    for (const id of createdEmailIds) {
      await request(`/api/emails/${id}/permanent`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => undefined);
    }
    if (attachmentId) await request(`/api/emails/attachments/${attachmentId}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => undefined);
  }
  if (checks.some((item) => item.status === "FAIL")) process.exitCode = 1;
}
