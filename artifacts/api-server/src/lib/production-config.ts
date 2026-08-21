const BASE_PRODUCTION_SECRETS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "SESSION_IP_HASH_SECRET"] as const;
const forbidden = new Set(["", "changeme", "change-me", "secret", "password", "your-secret", "undefined", "null"]);

export function featureEnabled(name: "ENABLE_GMAIL" | "ENABLE_2FA" | "ENABLE_NOTIFICATIONS", env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return false;
  if (!["true", "false", "1", "0"].includes(raw)) throw new Error(`${name} must be true or false`);
  return raw === "true" || raw === "1";
}

function requireSecret(env: NodeJS.ProcessEnv, name: string, failures: string[]): void {
  const value = env[name]?.trim();
  if (!value || forbidden.has(value.toLowerCase()) || value.length < 32) failures.push(`${name} must be a unique secret of at least 32 characters`);
}

export function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const failures: string[] = [];
  for (const name of BASE_PRODUCTION_SECRETS) requireSecret(env, name, failures);
  const enable2fa = featureEnabled("ENABLE_2FA", env);
  const enableGmail = featureEnabled("ENABLE_GMAIL", env);
  const enableNotifications = featureEnabled("ENABLE_NOTIFICATIONS", env);
  if (enable2fa) requireSecret(env, "TWO_FACTOR_ENCRYPTION_KEY", failures);
  if (enableGmail) requireSecret(env, "GMAIL_TOKEN_ENCRYPTION_KEY", failures);
  if (enable2fa && !/^[0-9a-f]{32,}$/i.test(env.TWO_FACTOR_ENCRYPTION_KEY?.trim() ?? "")) failures.push("TWO_FACTOR_ENCRYPTION_KEY must be a hex key");
  if (enableGmail && !env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim()) failures.push("GMAIL_TOKEN_ENCRYPTION_KEY is required when ENABLE_GMAIL is enabled");
  if (enableNotifications) requireSecret(env, "NOTIFICATION_TOKEN_ENCRYPTION_KEY", failures);
  if (enableNotifications && !/^[0-9a-f]{64,}$/i.test(env.NOTIFICATION_TOKEN_ENCRYPTION_KEY?.trim() ?? "")) failures.push("NOTIFICATION_TOKEN_ENCRYPTION_KEY must be a hex key");
  if (failures.length) throw new Error(`Production security configuration invalid: ${failures.join("; ")}`);
}
