const BASE_PRODUCTION_SECRETS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "SESSION_IP_HASH_SECRET"] as const;
const forbidden = new Set(["", "changeme", "change-me", "secret", "password", "your-secret", "undefined", "null"]);
const truthy = new Set(["true", "1"]);
const falsy = new Set(["false", "0"]);

export type FeatureFlag =
  | "ENABLE_GMAIL"
  | "ENABLE_2FA"
  | "ENABLE_NOTIFICATIONS"
  | "ENABLE_RATE_LIMITING"
  | "ENABLE_SECURITY_HEADERS"
  | "ATTACHMENT_SCANNING_ENABLED"
  | "FCM_ENABLED"
  | "WEB_PUSH_ENABLED"
  | "ENABLE_BILLING";

export function featureEnabled(name: FeatureFlag, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return false;
  if (!truthy.has(raw) && !falsy.has(raw)) throw new Error(`${name} must be true or false`);
  return truthy.has(raw);
}

function requireSecret(env: NodeJS.ProcessEnv, name: string, failures: string[], minimum = 32): void {
  const value = env[name]?.trim();
  if (!value || forbidden.has(value.toLowerCase()) || value.length < minimum) {
    failures.push(`${name} must be a unique secret of at least ${minimum} characters`);
  }
}

function requireHttpsUrl(env: NodeJS.ProcessEnv, name: string, failures: string[]): void {
  try {
    const value = new URL(env[name] ?? "");
    if (value.protocol !== "https:") failures.push(`${name} must use https in production`);
  } catch {
    failures.push(`${name} must be a valid https URL in production`);
  }
}

function requireNumber(env: NodeJS.ProcessEnv, name: string, failures: string[], min: number, max: number): void {
  const value = Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) failures.push(`${name} must be an integer between ${min} and ${max}`);
}

export function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const failures: string[] = [];
  for (const name of BASE_PRODUCTION_SECRETS) requireSecret(env, name, failures);

  const enable2fa = featureEnabled("ENABLE_2FA", env);
  const enableGmail = featureEnabled("ENABLE_GMAIL", env);
  const enableNotifications = featureEnabled("ENABLE_NOTIFICATIONS", env);
  const attachmentScanning = featureEnabled("ATTACHMENT_SCANNING_ENABLED", env);
  const fcm = featureEnabled("FCM_ENABLED", env);
  const webPush = featureEnabled("WEB_PUSH_ENABLED", env);

  if (enable2fa) requireSecret(env, "TWO_FACTOR_ENCRYPTION_KEY", failures);
  if (enableGmail) requireSecret(env, "GMAIL_TOKEN_ENCRYPTION_KEY", failures);
  if (enableNotifications) requireSecret(env, "NOTIFICATION_TOKEN_ENCRYPTION_KEY", failures);
  if (enable2fa && !/^[0-9a-f]{32,}$/i.test(env.TWO_FACTOR_ENCRYPTION_KEY?.trim() ?? "")) failures.push("TWO_FACTOR_ENCRYPTION_KEY must be a hex key");
  if (enableGmail && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI)) failures.push("Gmail OAuth settings are required when ENABLE_GMAIL is enabled");
  if (enableNotifications && !/^[0-9a-f]{64,}$/i.test(env.NOTIFICATION_TOKEN_ENCRYPTION_KEY?.trim() ?? "")) failures.push("NOTIFICATION_TOKEN_ENCRYPTION_KEY must be a hex key");
  if (fcm) {
    if (!env.FCM_PROJECT_ID || !env.FCM_ACCESS_TOKEN) failures.push("FCM_PROJECT_ID and FCM_ACCESS_TOKEN are required when FCM_ENABLED is enabled");
  }
  if (webPush) {
    requireSecret(env, "WEB_PUSH_VAPID_PRIVATE_KEY", failures, 16);
    if (!env.WEB_PUSH_VAPID_PUBLIC_KEY) failures.push("WEB_PUSH_VAPID_PUBLIC_KEY is required when WEB_PUSH_ENABLED is enabled");
  }
  if (attachmentScanning && (!env.CLAMAV_HOST || !env.CLAMAV_PORT)) failures.push("CLAMAV_HOST and CLAMAV_PORT are required when attachment scanning is enabled");

  requireHttpsUrl(env, "APP_BASE_URL", failures);
  requireHttpsUrl(env, "NOVAMAIL_WEB_URL", failures);
  const origins = (env.ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => origin === "*" || !origin.startsWith("https://"))) failures.push("ALLOWED_ORIGINS must be a non-empty HTTPS allowlist without wildcard in production");
  requireNumber(env, "TRUST_PROXY", failures, 0, 10);
  requireNumber(env, "REQUEST_BODY_LIMIT_BYTES", failures, 1024, 50 * 1024 * 1024);

  if (failures.length) throw new Error(`Production security configuration invalid: ${failures.join("; ")}`);
}
