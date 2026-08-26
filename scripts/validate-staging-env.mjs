#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const file = process.argv[2] ?? ".env.staging.example";
const strict = process.argv.includes("--strict");
const example = !strict && file.endsWith(".example");
const forbidden = new Set(["", "changeme", "change-me", "secret", "password", "replace-me", "replace_in_secret_manager", "your-secret", "undefined", "null"]);
const truthy = new Set(["true", "1"]);
const falsy = new Set(["false", "0"]);

const required = [
  "STAGING_ENVIRONMENT", "STAGING_DATA_NAMESPACE", "STAGING_APP_DOMAIN", "STAGING_APP_BASE_URL", "STAGING_WEB_URL",
  "STAGING_ALLOWED_ORIGINS", "STAGING_PGHOST", "STAGING_PGPORT", "STAGING_PGUSER", "STAGING_PGPASSWORD",
  "STAGING_PGDATABASE", "STAGING_DATABASE_URL", "STAGING_REDIS_HOST", "STAGING_REDIS_PORT", "STAGING_REDIS_PASSWORD",
  "STAGING_REDIS_URL", "STAGING_QUEUE_PREFIX", "STAGING_JWT_ACCESS_SECRET", "STAGING_JWT_REFRESH_SECRET",
  "STAGING_SESSION_IP_HASH_SECRET", "STAGING_TWO_FACTOR_ENCRYPTION_KEY", "STAGING_SMTP_HOST", "STAGING_SMTP_PORT",
  "STAGING_SMTP_FROM", "STAGING_ENABLE_GMAIL", "STAGING_ENABLE_NOTIFICATIONS", "STAGING_NOTIFICATION_PROVIDER",
  "STAGING_ATTACHMENT_SCANNING_ENABLED", "STAGING_CLAMAV_HOST", "STAGING_CLAMAV_PORT", "STAGING_FCM_ENABLED",
  "STAGING_WEB_PUSH_ENABLED", "STAGING_ENABLE_BILLING", "STAGING_BILLING_PROVIDER", "STAGING_WORKER_CONCURRENCY",
  "STAGING_QUEUE_MAX_ATTEMPTS", "STAGING_QUEUE_BACKOFF_MS", "STAGING_JOB_TIMEOUT_MS", "STAGING_SCHEDULER_ENABLED",
  "STAGING_BACKUP_DIR", "STAGING_BACKUP_RETENTION_DAYS", "STAGING_TEST_DATA_ENABLED", "STAGING_TEST_DATA_SEED",
  "S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_FORCE_PATH_STYLE",
];

function parseEnv(text) {
  const values = {};
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) throw new Error(`line ${index + 1} is not KEY=value`);
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function isWeak(value, minimum = 32) {
  return !value || forbidden.has(value.toLowerCase()) || value.length < minimum || /^(.)\1+$/.test(value);
}

function bool(values, name, failures) {
  const value = values[name]?.toLowerCase();
  if (!truthy.has(value) && !falsy.has(value)) failures.push(`${name} must be true or false`);
  return truthy.has(value);
}

function integer(values, name, failures, min, max) {
  const value = Number(values[name]);
  if (!Number.isInteger(value) || value < min || value > max) failures.push(`${name} must be an integer between ${min} and ${max}`);
}

function requireStrong(values, name, failures, minimum = 32) {
  if (isWeak(values[name], minimum)) failures.push(`${name} must be a unique secret of at least ${minimum} characters`);
}

function requireUrl(values, name, failures, allowExample) {
  try {
    const url = new URL(values[name] ?? "");
    if (!allowExample && url.protocol !== "https:") failures.push(`${name} must use https outside local mode`);
    if (url.username || url.password) failures.push(`${name} must not embed credentials`);
  } catch {
    failures.push(`${name} must be a valid URL`);
  }
}

function noProductionReference(values, failures) {
  const checked = ["STAGING_APP_DOMAIN", "STAGING_APP_BASE_URL", "STAGING_WEB_URL", "STAGING_ALLOWED_ORIGINS", "STAGING_PGHOST", "STAGING_PGDATABASE", "STAGING_REDIS_HOST", "STAGING_QUEUE_PREFIX", "STAGING_DATA_NAMESPACE", "S3_ENDPOINT", "S3_BUCKET"];

  for (const name of checked) {
    if (/\b(prod|production|live)\b/iu.test(values[name] ?? "")) failures.push(`${name} must not reference Production`);
  }
}

if (!fs.existsSync(file)) {
  console.error(`Staging environment file not found: ${file}`);
  process.exit(1);
}

let values;
try {
  values = parseEnv(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const failures = [];
for (const name of required) if (!(name in values)) failures.push(`${name} is missing`);
if (values.STAGING_ENVIRONMENT !== "staging") failures.push("STAGING_ENVIRONMENT must equal staging");
if (!values.STAGING_DATA_NAMESPACE || values.STAGING_DATA_NAMESPACE === "production") failures.push("STAGING_DATA_NAMESPACE must be non-production");
noProductionReference(values, failures);

for (const name of ["STAGING_PGPORT", "STAGING_REDIS_PORT", "STAGING_SMTP_PORT", "STAGING_CLAMAV_PORT"]) integer(values, name, failures, 1, 65535);
for (const [name, min, max] of [["STAGING_WORKER_CONCURRENCY", 1, 50], ["STAGING_QUEUE_MAX_ATTEMPTS", 1, 20], ["STAGING_QUEUE_BACKOFF_MS", 100, 3600000], ["STAGING_JOB_TIMEOUT_MS", 1000, 3600000], ["STAGING_BACKUP_RETENTION_DAYS", 1, 365]]) integer(values, name, failures, min, max);
for (const name of ["STAGING_ENABLE_2FA", "STAGING_ENABLE_GMAIL", "STAGING_ENABLE_NOTIFICATIONS", "STAGING_ATTACHMENT_SCANNING_ENABLED", "STAGING_FCM_ENABLED", "STAGING_WEB_PUSH_ENABLED", "STAGING_ENABLE_BILLING", "STAGING_REDIS_TLS", "STAGING_SCHEDULER_ENABLED", "STAGING_TEST_DATA_ENABLED"]) bool(values, name, failures);

const allowExample = example || values.STAGING_TLS_MODE === "local" || values.STAGING_APP_DOMAIN?.endsWith(".invalid");
const s3EndpointIsLocal = (() => {
  try {
    return ["localhost", "127.0.0.1", "staging-object-storage"].includes(new URL(values.S3_ENDPOINT ?? "").hostname);
  } catch {
    return false;
  }
})();
requireUrl(values, "STAGING_APP_BASE_URL", failures, allowExample);
requireUrl(values, "STAGING_WEB_URL", failures, allowExample);
const origins = (values.STAGING_ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
if (!origins.length || origins.some((origin) => origin === "*" || !/^https?:\/\//u.test(origin))) failures.push("STAGING_ALLOWED_ORIGINS must be a non-empty explicit origin allowlist");
requireUrl(values, "S3_ENDPOINT", failures, example || s3EndpointIsLocal);
if (!values.S3_BUCKET || values.S3_BUCKET.includes("/") || /\s/u.test(values.S3_BUCKET)) failures.push("S3_BUCKET must be a non-empty bucket name without whitespace or path separators");
bool(values, "S3_FORCE_PATH_STYLE", failures);

if (!example) {
  for (const name of ["STAGING_PGPASSWORD", "STAGING_REDIS_PASSWORD", "STAGING_JWT_ACCESS_SECRET", "STAGING_JWT_REFRESH_SECRET", "STAGING_SESSION_IP_HASH_SECRET"]) requireStrong(values, name, failures);
  if (bool(values, "STAGING_ENABLE_2FA", failures)) requireStrong(values, "STAGING_TWO_FACTOR_ENCRYPTION_KEY", failures);
  if (bool(values, "STAGING_ENABLE_NOTIFICATIONS", failures)) requireStrong(values, "STAGING_NOTIFICATION_TOKEN_ENCRYPTION_KEY", failures);
  for (const name of ["STAGING_SMTP_HOST", "STAGING_SMTP_FROM"]) if (!values[name]) failures.push(`${name} is required in strict mode`);
  if (isWeak(values.STAGING_TEST_DATA_SEED, 16)) failures.push("STAGING_TEST_DATA_SEED must be unique outside the example file");
  if (!values.STAGING_DATABASE_URL?.startsWith("postgresql://")) failures.push("STAGING_DATABASE_URL must be a PostgreSQL URL");
  if (!values.STAGING_REDIS_URL?.startsWith("redis://") && !values.STAGING_REDIS_URL?.startsWith("rediss://")) failures.push("STAGING_REDIS_URL must be a Redis URL");
  if (!s3EndpointIsLocal && values.S3_ENDPOINT?.startsWith("http://")) failures.push("S3_ENDPOINT must use https outside local MinIO mode");
  requireStrong(values, "S3_ACCESS_KEY", failures, 8);
  requireStrong(values, "S3_SECRET_KEY", failures, 32);
}

const gmail = bool(values, "STAGING_ENABLE_GMAIL", failures);
if (gmail) {
  for (const name of ["STAGING_GOOGLE_CLIENT_ID", "STAGING_GOOGLE_CLIENT_SECRET", "STAGING_GMAIL_TOKEN_ENCRYPTION_KEY", "STAGING_GMAIL_PUBSUB_OIDC_AUDIENCE", "STAGING_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL"]) requireStrong(values, name, failures, name.includes("CLIENT_ID") ? 8 : 32);
  if (values.STAGING_GMAIL_PROVIDER_STATUS === "not_configured") failures.push("STAGING_GMAIL_PROVIDER_STATUS cannot be not_configured when Gmail is enabled");
} else if (values.STAGING_GMAIL_PROVIDER_STATUS !== "not_configured") failures.push("Gmail must be explicitly not_configured when disabled");

const clamav = bool(values, "STAGING_ATTACHMENT_SCANNING_ENABLED", failures);
if (clamav && values.STAGING_CLAMAV_STATUS === "not_configured") failures.push("STAGING_CLAMAV_STATUS cannot be not_configured when scanning is enabled");
if (!clamav && values.STAGING_CLAMAV_STATUS !== "not_configured") failures.push("ClamAV must be explicitly not_configured when disabled");

const fcm = bool(values, "STAGING_FCM_ENABLED", failures);
if (fcm) {
  requireStrong(values, "STAGING_FCM_PROJECT_ID", failures, 6);
  requireStrong(values, "STAGING_FCM_ACCESS_TOKEN", failures);
  if (values.STAGING_FCM_STATUS === "not_configured") failures.push("STAGING_FCM_STATUS cannot be not_configured when FCM is enabled");
} else if (values.STAGING_FCM_STATUS !== "not_configured") failures.push("FCM must be explicitly not_configured when disabled");

const webPush = bool(values, "STAGING_WEB_PUSH_ENABLED", failures);
if (webPush) {
  requireStrong(values, "STAGING_WEB_PUSH_VAPID_PUBLIC_KEY", failures, 16);
  requireStrong(values, "STAGING_WEB_PUSH_VAPID_PRIVATE_KEY", failures, 16);
  if (values.STAGING_WEB_PUSH_STATUS === "not_configured") failures.push("STAGING_WEB_PUSH_STATUS cannot be not_configured when Web Push is enabled");
} else if (values.STAGING_WEB_PUSH_STATUS !== "not_configured") failures.push("Web Push must be explicitly not_configured when disabled");

function optionalProviderValidation(values, failures, fields, label, timeoutName, timeoutDefault, timeoutMax, allowLocal = false, extraActiveFields = []) {
  const active = [...fields, ...extraActiveFields].some((name) => Boolean(values[name]?.trim()));
  if (!active) return false;
  for (const name of fields) if (!values[name]?.trim()) failures.push(`${name} is required when ${label} is configured`);
  if (values[fields[1]]?.trim()) requireUrl(values, fields[1], failures, allowLocal);
  if (values[timeoutName] !== undefined) integer(values, timeoutName, failures, 1000, timeoutMax);
  else values[timeoutName] = String(timeoutDefault);
  return true;
}

const threatAnalysisConfigured = optionalProviderValidation(values, failures, ["THREAT_ANALYSIS_PROVIDER", "THREAT_ANALYSIS_API_URL", "THREAT_ANALYSIS_API_KEY"], "Threat Analysis", "THREAT_ANALYSIS_TIMEOUT_MS", 8000, 30000, example, ["THREAT_ANALYSIS_MODEL"]);
if (threatAnalysisConfigured) {
  if (values.THREAT_ANALYSIS_MAX_RETRIES !== undefined) integer(values, "THREAT_ANALYSIS_MAX_RETRIES", failures, 0, 3);
  if (values.THREAT_ANALYSIS_RATE_LIMIT_PER_MINUTE !== undefined) integer(values, "THREAT_ANALYSIS_RATE_LIMIT_PER_MINUTE", failures, 1, 100);
  if (values.THREAT_ANALYSIS_MAX_INPUT_TOKENS_PER_DAY !== undefined) integer(values, "THREAT_ANALYSIS_MAX_INPUT_TOKENS_PER_DAY", failures, 1000, 10000000);
  if (values.THREAT_ANALYSIS_ASSISTANT_RATE_LIMIT_PER_MINUTE !== undefined) integer(values, "THREAT_ANALYSIS_ASSISTANT_RATE_LIMIT_PER_MINUTE", failures, 1, 30);
}
const urlIntelligenceConfigured = optionalProviderValidation(values, failures, ["URL_INTELLIGENCE_PROVIDER", "URL_INTELLIGENCE_API_URL", "URL_INTELLIGENCE_API_KEY"], "URL Intelligence", "URL_INTELLIGENCE_TIMEOUT_MS", 8000, 30000, example);
const sandboxConfigured = optionalProviderValidation(values, failures, ["ATTACHMENT_SANDBOX_PROVIDER", "ATTACHMENT_SANDBOX_API_URL", "ATTACHMENT_SANDBOX_API_KEY"], "Attachment Sandbox", "ATTACHMENT_SANDBOX_TIMEOUT_MS", 15000, 60000, example);
if (sandboxConfigured && values.ATTACHMENT_SANDBOX_ENVIRONMENT !== "staging") failures.push("ATTACHMENT_SANDBOX_ENVIRONMENT must equal staging when the sandbox is configured");

const billing = bool(values, "STAGING_ENABLE_BILLING", failures);
if (billing) {
  if (values.STAGING_BILLING_PROVIDER === "fake") failures.push("real billing cannot be enabled with the fake provider");
  requireStrong(values, "STAGING_BILLING_WEBHOOK_SECRET", failures);
  if (values.STAGING_BILLING_STATUS === "not_configured") failures.push("STAGING_BILLING_STATUS cannot be not_configured when billing is enabled");
} else if (values.STAGING_BILLING_STATUS !== "not_configured") failures.push("Billing must be explicitly not_configured when disabled");

if (failures.length) {
  console.error(`Staging environment validation failed for ${file}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Staging environment validation passed (${example ? "schema/example mode" : "strict mode"}): ${file}`);
console.log(`External integrations: Gmail=${gmail ? "configured" : "not_configured"}, ClamAV=${clamav ? "configured" : "not_configured"}, FCM=${fcm ? "configured" : "not_configured"}, WebPush=${webPush ? "configured" : "not_configured"}, Billing=${billing ? "configured" : "not_configured"}, ThreatAnalysis=${threatAnalysisConfigured ? "configured" : "not_configured"}, UrlIntelligence=${urlIntelligenceConfigured ? "configured" : "not_configured"}, AttachmentSandbox=${sandboxConfigured ? "configured" : "not_configured"}`);
