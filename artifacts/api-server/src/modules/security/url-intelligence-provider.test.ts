import { describe, expect, it, vi } from "vitest";
import { getUrlIntelligenceProvider, urlIntelligenceProviderConfigForTests, urlIntelligenceProviderStatus } from "./url-intelligence-provider.js";

describe("URL intelligence provider", () => {
  it("is NOT_CONFIGURED without a complete provider", () => {
    expect(urlIntelligenceProviderConfigForTests({ NODE_ENV: "staging" })).toBeNull();
    expect(urlIntelligenceProviderStatus({ NODE_ENV: "staging" })).toEqual({ state: "NOT_CONFIGURED", provider: null });
  });

  it("rejects non-HTTPS external endpoints", () => {
    expect(urlIntelligenceProviderConfigForTests({ NODE_ENV: "staging", URL_INTELLIGENCE_PROVIDER: "ti", URL_INTELLIGENCE_API_URL: "http://ti.example.test/check", URL_INTELLIGENCE_API_KEY: "staging-only" })).toBeNull();
  });

  it("parses bounded structured findings without sending attachments", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ findings: [{ url: "https://example.test/check", domainAgeDays: 12, tlsValid: true, redirects: ["https://example.test/final"], reputation: "unknown", flags: ["observed"] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = getUrlIntelligenceProvider({ NODE_ENV: "test", URL_INTELLIGENCE_PROVIDER: "test", URL_INTELLIGENCE_API_URL: "http://127.0.0.1:8787/check", URL_INTELLIGENCE_API_KEY: "test-only" });
    expect(provider).not.toBeNull();
    await expect(provider!.analyze({ urls: [{ url: "https://example.test/check", host: "example.test" }] })).resolves.toMatchObject([{ domainAgeDays: 12, tlsValid: true, redirects: ["https://example.test/final"], reputation: "unknown" }]);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined] | undefined;
    expect(String(firstCall?.[1]?.body ?? "")).not.toContain("attachment");
  });
});
