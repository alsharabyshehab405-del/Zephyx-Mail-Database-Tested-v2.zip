export type AiPhishingVerdict = "safe" | "suspicious" | "dangerous" | "blocked";

export type ThreatAnalysisProviderInput = {
  subject: string;
  senderEmail: string;
  senderName: string | null;
  senderDomain: string | null;
  redactedBodyText: string;
  links: Array<{ url: string; host: string | null; reasons: string[] }>;
  impersonationSignals: string[];
  locale?: string | null;
};

export type SecurityAssistantProviderInput = {
  question: string;
  organizationSummary: Record<string, unknown>;
  locale?: string | null;
};

export type SecurityAssistantProviderResult = {
  answer: string;
  keyPoints: string[];
};

export type ThreatAnalysisProviderResult = {
  riskScore: number;
  verdict: AiPhishingVerdict;
  reasons: Array<{ code: string; label: string }>;
  evidence: Array<{ type: string; summary: string }>;
  recommendedAction: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface ThreatAnalysisProvider {
  readonly name: string;
  readonly model: string;
  analyze(input: ThreatAnalysisProviderInput): Promise<ThreatAnalysisProviderResult>;
  assist?(input: SecurityAssistantProviderInput): Promise<SecurityAssistantProviderResult>;
}

type ProviderConfig = {
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
};

const DEFAULT_MODEL = "gpt-5-mini";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 8_000;

function providerConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig | null {
  const name = env.THREAT_ANALYSIS_PROVIDER?.trim();
  const endpoint = env.THREAT_ANALYSIS_API_URL?.trim();
  const apiKey = env.THREAT_ANALYSIS_API_KEY?.trim();
  const model = env.THREAT_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL;
  if (!name || !endpoint || !apiKey) return null;
  try {
    const parsed = new URL(endpoint);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol !== "https:" && !(local && env.NODE_ENV !== "production")) return null;
  } catch {
    return null;
  }
  const maxRetries = Number.isInteger(Number.parseInt(env.THREAT_ANALYSIS_MAX_RETRIES ?? "", 10)) ? Math.max(0, Math.min(3, Number.parseInt(env.THREAT_ANALYSIS_MAX_RETRIES!, 10))) : MAX_RETRIES;
  const timeoutMs = Number.isInteger(Number.parseInt(env.THREAT_ANALYSIS_TIMEOUT_MS ?? "", 10)) ? Math.max(1_000, Math.min(30_000, Number.parseInt(env.THREAT_ANALYSIS_TIMEOUT_MS!, 10))) : REQUEST_TIMEOUT_MS;
  return { name, endpoint, apiKey, model, maxRetries, timeoutMs };
}

function sanitizeProviderText(value: string, maxLength: number): string {
  return value.replace(/\u0000/g, "").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/(?:password|passwd|passcode|otp|secret|api[- ]?key)\s*[:=]\s*\S+/gi, "$1: [redacted]").slice(0, maxLength);
}

function finiteInteger(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function parseResult(value: unknown): ThreatAnalysisProviderResult {
  if (!value || typeof value !== "object") throw new Error("AI provider returned an invalid result");
  const raw = value as Record<string, unknown>;
  const verdict = raw.verdict === "safe" || raw.verdict === "suspicious" || raw.verdict === "dangerous" || raw.verdict === "blocked" ? raw.verdict : null;
  if (!verdict) throw new Error("AI provider returned an invalid verdict");
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.filter((item): item is { code: string; label: string } => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).code === "string" && typeof (item as Record<string, unknown>).label === "string")).slice(0, 8).map((item) => ({ code: item.code.slice(0, 80), label: sanitizeProviderText(item.label, 240) })) : [];
  const evidence = Array.isArray(raw.evidence) ? raw.evidence.filter((item): item is { type: string; summary: string } => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).type === "string" && typeof (item as Record<string, unknown>).summary === "string")).slice(0, 8).map((item) => ({ type: item.type.slice(0, 80), summary: sanitizeProviderText(item.summary, 300) })) : [];
  return {
    riskScore: finiteInteger(raw.riskScore, 0, 100, 50),
    verdict,
    reasons,
    evidence,
    recommendedAction: typeof raw.recommendedAction === "string" ? sanitizeProviderText(raw.recommendedAction, 240) : "Review the message carefully before acting.",
    inputTokens: finiteInteger(raw.inputTokens, 0, 100_000, 0) || undefined,
    outputTokens: finiteInteger(raw.outputTokens, 0, 20_000, 0) || undefined,
  };
}

function extractJson(content: unknown): unknown {
  if (typeof content !== "string") throw new Error("AI provider returned no structured content");
  const trimmed = content.trim();
  const candidate = trimmed.startsWith("{") ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("AI provider returned invalid JSON");
  return JSON.parse(candidate);
}

function promptFor(input: ThreatAnalysisProviderInput): string {
  return JSON.stringify({
    subject: input.subject,
    sender: { email: input.senderEmail, name: input.senderName, domain: input.senderDomain },
    redactedBodyText: input.redactedBodyText,
    links: input.links,
    impersonationSignals: input.impersonationSignals,
    locale: input.locale ?? "en",
  });
}

class OpenAiCompatibleThreatAnalysisProvider implements ThreatAnalysisProvider {
  readonly name: string;
  readonly model: string;
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.name = config.name;
    this.model = config.model;
  }

  async analyze(input: ThreatAnalysisProviderInput): Promise<ThreatAnalysisProviderResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await fetch(this.config.endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            max_completion_tokens: 700,
            messages: [
              { role: "system", content: "You are an email phishing analyst. Analyze only the supplied redacted metadata and text. Never infer or invent facts. Do not treat your result as an automatic block. Return JSON only with riskScore (integer 0..100), verdict (safe|suspicious|dangerous|blocked), reasons (array of {code,label}), evidence (array of {type,summary}), and recommendedAction. Do not mention or request attachments. If there is no reliable evidence, use safe or suspicious with a clear uncertainty reason." },
              { role: "user", content: promptFor(input) },
            ],
            response_format: { type: "json_object" },
          }),
        });
        const data = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } };
        if (!response.ok) throw new Error(`provider_http_${response.status}`);
        const parsed = parseResult(extractJson(data.choices?.[0]?.message?.content));
        return { ...parsed, inputTokens: parsed.inputTokens ?? data.usage?.prompt_tokens, outputTokens: parsed.outputTokens ?? data.usage?.completion_tokens };
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxRetries) await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("AI provider unavailable");
  }

  async assist(input: SecurityAssistantProviderInput): Promise<SecurityAssistantProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_completion_tokens: 500,
          messages: [
            { role: "system", content: "You are a security assistant. Use only the aggregate organization summary provided by the user. Never reveal message bodies, addresses, secrets, or data from another organization. Return JSON only with answer (string) and keyPoints (array of strings). Do not invent numbers." },
            { role: "user", content: JSON.stringify({ question: sanitizeProviderText(input.question, 500), organizationSummary: input.organizationSummary, locale: input.locale ?? "en" }) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      const data = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }> };
      if (!response.ok) throw new Error(`provider_http_${response.status}`);
      const raw = extractJson(data.choices?.[0]?.message?.content);
      if (!raw || typeof raw !== "object") throw new Error("AI provider returned an invalid assistant result");
      const value = raw as Record<string, unknown>;
      if (typeof value.answer !== "string") throw new Error("AI provider returned no assistant answer");
      const keyPoints = Array.isArray(value.keyPoints) ? value.keyPoints.filter((point): point is string => typeof point === "string").slice(0, 8).map((point) => sanitizeProviderText(point, 240)) : [];
      return { answer: sanitizeProviderText(value.answer, 1_000), keyPoints };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getThreatAnalysisProvider(env: NodeJS.ProcessEnv = process.env): ThreatAnalysisProvider | null {
  const config = providerConfig(env);
  return config ? new OpenAiCompatibleThreatAnalysisProvider(config) : null;
}

export function threatAnalysisProviderStatus(env: NodeJS.ProcessEnv = process.env): { state: "CONFIGURED" | "NOT_CONFIGURED"; provider: string | null; model: string | null } {
  const config = providerConfig(env);
  return { state: config ? "CONFIGURED" : "NOT_CONFIGURED", provider: config?.name ?? null, model: config?.model ?? null };
}

export const threatAnalysisProviderConfigForTests = providerConfig;
