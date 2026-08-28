export type AiPolicyConfig = {
  timeoutMs: number;
  maxRetries: number;
  failureThreshold: number;
  circuitOpenMs: number;
  maxRequestsPerWindow: number;
  maxInputTokensPerWindow: number;
  windowMs: number;
};

type ScopeState = {
  windowStartedAt: number;
  requestCount: number;
  inputTokens: number;
};

const DEFAULT_CONFIG: AiPolicyConfig = {
  timeoutMs: 10_000,
  maxRetries: 1,
  failureThreshold: 3,
  circuitOpenMs: 60_000,
  maxRequestsPerWindow: 20,
  maxInputTokensPerWindow: 100_000,
  windowMs: 60_000,
};

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function loadAiPolicyConfig(env: NodeJS.ProcessEnv = process.env): AiPolicyConfig {
  return {
    timeoutMs: boundedInteger(env.AI_PROVIDER_TIMEOUT_MS, DEFAULT_CONFIG.timeoutMs, 500, 60_000),
    maxRetries: boundedInteger(env.AI_PROVIDER_MAX_RETRIES, DEFAULT_CONFIG.maxRetries, 0, 2),
    failureThreshold: boundedInteger(env.AI_PROVIDER_CIRCUIT_FAILURE_THRESHOLD, DEFAULT_CONFIG.failureThreshold, 1, 10),
    circuitOpenMs: boundedInteger(env.AI_PROVIDER_CIRCUIT_OPEN_MS, DEFAULT_CONFIG.circuitOpenMs, 1_000, 300_000),
    maxRequestsPerWindow: boundedInteger(env.AI_PROVIDER_RATE_LIMIT, DEFAULT_CONFIG.maxRequestsPerWindow, 1, 1_000),
    maxInputTokensPerWindow: boundedInteger(env.AI_PROVIDER_MAX_INPUT_TOKENS, DEFAULT_CONFIG.maxInputTokensPerWindow, 1_000, 10_000_000),
    windowMs: boundedInteger(env.AI_PROVIDER_RATE_WINDOW_MS, DEFAULT_CONFIG.windowMs, 1_000, 86_400_000),
  };
}

export function estimateInputTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function assertAiConsent(consentGranted: boolean): void {
  if (!consentGranted) {
    throw Object.assign(new Error("Explicit consent is required before sending redacted email text to an AI provider"), {
      statusCode: 428,
      code: "AI_CONSENT_REQUIRED",
    });
  }
}

function timeoutError(): Error & { statusCode: number; retryable: boolean } {
  return Object.assign(new Error("AI provider request timed out"), { statusCode: 504, retryable: true });
}

export class AiRequestPolicy {
  private readonly scopes = new Map<string, ScopeState>();
  private failures = 0;
  private circuitOpenUntil = 0;

  constructor(private readonly config: AiPolicyConfig = loadAiPolicyConfig()) {}

  getSnapshot() {
    return { failures: this.failures, circuitOpenUntil: this.circuitOpenUntil, scopes: this.scopes.size };
  }

  private checkCircuit(now: number): void {
    if (this.circuitOpenUntil > now) {
      throw Object.assign(new Error("AI provider circuit is open"), { statusCode: 503, code: "AI_CIRCUIT_OPEN" });
    }
    if (this.circuitOpenUntil !== 0) {
      this.circuitOpenUntil = 0;
      this.failures = 0;
    }
  }

  private consume(scopeKey: string, inputTokens: number, now: number): void {
    const current = this.scopes.get(scopeKey) ?? { windowStartedAt: now, requestCount: 0, inputTokens: 0 };
    if (now - current.windowStartedAt >= this.config.windowMs) {
      current.windowStartedAt = now;
      current.requestCount = 0;
      current.inputTokens = 0;
    }
    if (current.requestCount >= this.config.maxRequestsPerWindow) {
      throw Object.assign(new Error("AI provider rate limit reached"), { statusCode: 429, code: "AI_RATE_LIMIT" });
    }
    if (current.inputTokens + inputTokens > this.config.maxInputTokensPerWindow) {
      throw Object.assign(new Error("AI provider input budget reached"), { statusCode: 429, code: "AI_INPUT_BUDGET" });
    }
    current.requestCount += 1;
    current.inputTokens += inputTokens;
    this.scopes.set(scopeKey, current);
  }

  private async attempt<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await Promise.race([
        request(controller.signal),
        new Promise<T>((_, reject) => controller.signal.addEventListener("abort", () => reject(timeoutError()), { once: true })),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async execute<T>(options: { scopeKey: string; inputText: string; consentGranted: boolean; request: (signal: AbortSignal) => Promise<T> }): Promise<T> {
    assertAiConsent(options.consentGranted);
    const now = Date.now();
    this.checkCircuit(now);
    this.consume(options.scopeKey, estimateInputTokens(options.inputText), now);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        const result = await this.attempt(options.request);
        this.failures = 0;
        this.circuitOpenUntil = 0;
        return result;
      } catch (error) {
        lastError = error;
        const status = (error as { statusCode?: number }).statusCode;
        if (attempt >= this.config.maxRetries || (typeof status === "number" && status < 500)) break;
      }
    }
    this.failures += 1;
    if (this.failures >= this.config.failureThreshold) this.circuitOpenUntil = Date.now() + this.config.circuitOpenMs;
    throw lastError instanceof Error ? lastError : new Error("AI provider request failed");
  }
}
