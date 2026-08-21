const REQUIRED_PRODUCTION_SECRETS = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SESSION_IP_HASH_SECRET",
  "TWO_FACTOR_ENCRYPTION_KEY",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
] as const;

const forbidden = new Set(["", "changeme", "change-me", "secret", "password", "your-secret", "undefined", "null"]);

export function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const failures: string[] = [];
  for (const name of REQUIRED_PRODUCTION_SECRETS) {
    const value = env[name]?.trim();
    if (!value || forbidden.has(value.toLowerCase()) || value.length < 32) failures.push(`${name} must be a unique secret of at least 32 characters`);
  }
  const twoFactor = env.TWO_FACTOR_ENCRYPTION_KEY?.trim() ?? "";
  if (twoFactor && !/^[0-9a-f]{32,}$/i.test(twoFactor)) failures.push("TWO_FACTOR_ENCRYPTION_KEY must be a hex key");
  if (failures.length) throw new Error(`Production security configuration invalid: ${failures.join("; ")}`);
}
