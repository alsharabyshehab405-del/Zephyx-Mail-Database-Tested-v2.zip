import { afterEach, describe, expect, it, vi } from "vitest";
import { getThreatAnalysisProvider, threatAnalysisProviderConfigForTests, threatAnalysisProviderStatus } from "./threat-analysis-provider.js";

const input = {
  subject: "Urgent account review",
  senderEmail: "a***@example.test",
  senderName: "Microsoft Support",
  senderDomain: "example.test",
  redactedBodyText: "[redacted-email] Please review the link.",
  links: [{ url: "https://example.test/login", host: "example.test", reasons: ["login_path"] }],
  impersonationSignals: ["display_name_domain_mismatch"],
  locale: "en",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ThreatAnalysisProvider", () => {
  it("stays NOT_CONFIGURED without a complete approved provider configuration", () => {
    expect(getThreatAnalysisProvider({})).toBeNull();
    expect(threatAnalysisProviderStatus({})).toEqual({ state: "NOT_CONFIGURED", provider: null, model: null });
  });

  it("rejects an external non-HTTPS endpoint", () => {
    expect(threatAnalysisProviderConfigForTests({ THREAT_ANALYSIS_PROVIDER: "test", THREAT_ANALYSIS_API_URL: "http://provider.example.test", THREAT_ANALYSIS_API_KEY: "test-key" })).toBeNull();
  });

  it("parses structured output and never includes attachment data in the request", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      expect(body).toContain("display_name_domain_mismatch");
      expect(body).not.toContain("attachment-secret");
      expect(body).not.toContain("raw-private-body");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ riskScore: 84, verdict: "dangerous", reasons: [{ code: "impersonation", label: "The sender identity does not match the domain." }], evidence: [{ type: "sender", summary: "Display name/domain mismatch." }], recommendedAction: "Do not use the link." }) } }], usage: { prompt_tokens: 123, completion_tokens: 41 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = getThreatAnalysisProvider({ NODE_ENV: "test", THREAT_ANALYSIS_PROVIDER: "approved-test-provider", THREAT_ANALYSIS_API_URL: "https://provider.example.test/analyze", THREAT_ANALYSIS_API_KEY: "test-key", THREAT_ANALYSIS_MODEL: "test-model" });
    expect(provider).not.toBeNull();
    const result = await provider!.analyze(input);
    expect(result.verdict).toBe("dangerous");
    expect(result.riskScore).toBe(84);
    expect(result.inputTokens).toBe(123);
    expect(result.outputTokens).toBe(41);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed at the provider boundary when the endpoint times out or rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network failure"); }));
    const provider = getThreatAnalysisProvider({ NODE_ENV: "test", THREAT_ANALYSIS_PROVIDER: "approved-test-provider", THREAT_ANALYSIS_API_URL: "https://provider.example.test/analyze", THREAT_ANALYSIS_API_KEY: "test-key" });
    await expect(provider!.analyze(input)).rejects.toThrow();
  });
});
