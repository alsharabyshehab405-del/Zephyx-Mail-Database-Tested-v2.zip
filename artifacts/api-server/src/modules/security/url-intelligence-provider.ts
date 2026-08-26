export type UrlIntelligenceProviderInput = {
  urls: Array<{ url: string; host: string | null }>;
};

export type UrlIntelligenceFinding = {
  url: string;
  domainAgeDays: number | null;
  tlsValid: boolean | null;
  redirects: string[];
  reputation: "known_safe" | "known_malicious" | "unknown";
  flags: string[];
};

export interface UrlIntelligenceProvider {
  readonly name: string;
  analyze(input: UrlIntelligenceProviderInput): Promise<UrlIntelligenceFinding[]>;
}

type UrlProviderConfig = { name: string; endpoint: string; apiKey: string; timeoutMs: number };

function urlProviderConfig(env: NodeJS.ProcessEnv = process.env): UrlProviderConfig | null {
  const name = env.URL_INTELLIGENCE_PROVIDER?.trim();
  const endpoint = env.URL_INTELLIGENCE_API_URL?.trim();
  const apiKey = env.URL_INTELLIGENCE_API_KEY?.trim();
  if (!name || !endpoint || !apiKey) return null;
  try {
    const parsed = new URL(endpoint);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol !== "https:" && !(local && env.NODE_ENV !== "production")) return null;
  } catch {
    return null;
  }
  const timeout = Number.parseInt(env.URL_INTELLIGENCE_TIMEOUT_MS ?? "8000", 10);
  return { name, endpoint, apiKey, timeoutMs: Number.isInteger(timeout) ? Math.max(1_000, Math.min(30_000, timeout)) : 8_000 };
}

function safeString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/[\u0000\r\n]/g, " ").slice(0, maxLength) : "";
}

function parseFindings(value: unknown): UrlIntelligenceFinding[] {
  const raw = value && typeof value === "object" ? value as { findings?: unknown } : {};
  if (!Array.isArray(raw.findings)) throw new Error("URL intelligence provider returned an invalid result");
  return raw.findings.slice(0, 50).flatMap((item): UrlIntelligenceFinding[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const url = safeString(candidate.url, 2_000);
    if (!url) return [];
    const domainAgeDays = typeof candidate.domainAgeDays === "number" && Number.isInteger(candidate.domainAgeDays)
      ? Math.max(0, Math.min(100_000, candidate.domainAgeDays))
      : null;
    const tlsValid = typeof candidate.tlsValid === "boolean" ? candidate.tlsValid : null;
    const reputation = candidate.reputation === "known_safe" || candidate.reputation === "known_malicious" ? candidate.reputation : "unknown";
    const redirects = Array.isArray(candidate.redirects) ? candidate.redirects.filter((redirect): redirect is string => typeof redirect === "string").slice(0, 10).map((redirect) => safeString(redirect, 2_000)) : [];
    const flags = Array.isArray(candidate.flags) ? candidate.flags.filter((flag): flag is string => typeof flag === "string").slice(0, 12).map((flag) => safeString(flag, 100)) : [];
    return [{ url, domainAgeDays, tlsValid, redirects, reputation, flags }];
  });
}

class HttpUrlIntelligenceProvider implements UrlIntelligenceProvider {
  readonly name: string;
  private readonly config: UrlProviderConfig;

  constructor(config: UrlProviderConfig) { this.name = config.name; this.config = config; }

  async analyze(input: UrlIntelligenceProviderInput): Promise<UrlIntelligenceFinding[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ urls: input.urls.slice(0, 50) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`url_intelligence_http_${response.status}`);
      return parseFindings(data);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getUrlIntelligenceProvider(env: NodeJS.ProcessEnv = process.env): UrlIntelligenceProvider | null {
  const config = urlProviderConfig(env);
  return config ? new HttpUrlIntelligenceProvider(config) : null;
}

export function urlIntelligenceProviderStatus(env: NodeJS.ProcessEnv = process.env): { state: "CONFIGURED" | "NOT_CONFIGURED"; provider: string | null } {
  const config = urlProviderConfig(env);
  return { state: config ? "CONFIGURED" : "NOT_CONFIGURED", provider: config?.name ?? null };
}

export const urlIntelligenceProviderConfigForTests = urlProviderConfig;
