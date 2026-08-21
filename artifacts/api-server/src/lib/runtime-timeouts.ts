export type SmtpTimeoutConfig = {
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
};

const DEFAULTS: SmtpTimeoutConfig = {
  connectionTimeoutMs: 10_000,
  greetingTimeoutMs: 10_000,
  socketTimeoutMs: 15_000,
};

function integerEnv(name: string, fallback: number, min: number, max: number, env: NodeJS.ProcessEnv): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function loadSmtpTimeouts(env: NodeJS.ProcessEnv = process.env): SmtpTimeoutConfig {
  return {
    connectionTimeoutMs: integerEnv("SMTP_CONNECTION_TIMEOUT_MS", DEFAULTS.connectionTimeoutMs, 100, 600_000, env),
    greetingTimeoutMs: integerEnv("SMTP_GREETING_TIMEOUT_MS", DEFAULTS.greetingTimeoutMs, 100, 600_000, env),
    socketTimeoutMs: integerEnv("SMTP_SOCKET_TIMEOUT_MS", DEFAULTS.socketTimeoutMs, 100, 600_000, env),
  };
}

export function validateTimeoutRelationship(timeouts: SmtpTimeoutConfig, jobTimeoutMs: number): void {
  if (!Number.isInteger(jobTimeoutMs) || jobTimeoutMs < 1_000) {
    throw new Error("JOB_TIMEOUT_MS must be an integer of at least 1000ms");
  }
  const maximumSmtpTimeout = Math.max(timeouts.connectionTimeoutMs, timeouts.greetingTimeoutMs, timeouts.socketTimeoutMs);
  if (maximumSmtpTimeout >= jobTimeoutMs) {
    throw new Error("SMTP timeouts must be strictly less than JOB_TIMEOUT_MS");
  }
}

export function workerLeaseMs(jobTimeoutMs: number, timeouts: SmtpTimeoutConfig): number {
  validateTimeoutRelationship(timeouts, jobTimeoutMs);
  return Math.max(jobTimeoutMs, timeouts.socketTimeoutMs) + 30_000;
}

export const SMTP_TIMEOUT_DEFAULTS = { ...DEFAULTS };
