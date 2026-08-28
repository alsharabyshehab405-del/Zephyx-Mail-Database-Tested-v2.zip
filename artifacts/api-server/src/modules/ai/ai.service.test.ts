import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let generateEmailDraft: typeof import("./ai.service.js").generateEmailDraft;

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic.invalid:5432/not-used");
  ({ generateEmailDraft } = await import("./ai.service.js"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI service provider boundary", () => {
  it("returns structured NOT_CONFIGURED without contacting a provider", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(generateEmailDraft({ operation: "draft", instruction: "Write a synthetic reminder" })).resolves.toEqual({
      state: "NOT_CONFIGURED",
      providerState: "NOT_CONFIGURED",
      operation: "draft",
      text: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enforces explicit consent before a configured provider can receive redacted text", async () => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-provider-marker");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(generateEmailDraft({ operation: "rephrase", context: "Synthetic private content", scopeKey: "user:synthetic", consentGranted: false })).rejects.toMatchObject({ statusCode: 428, code: "AI_CONSENT_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a suggestion-only result and never includes attachment fields in the provider request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "synthetic-provider-marker");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Synthetic suggested draft" }] } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await generateEmailDraft({ operation: "draft", instruction: "Write a synthetic follow-up", context: "Synthetic sender context", scopeKey: "user:synthetic", consentGranted: true });
    expect(result).toEqual({ state: "READY", providerState: "CONFIGURED", operation: "draft", text: "Synthetic suggested draft" });
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody).not.toHaveProperty("attachments");
    expect(JSON.stringify(requestBody)).not.toContain("password");
  });
});
