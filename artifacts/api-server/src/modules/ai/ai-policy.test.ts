import { describe, expect, it, vi } from "vitest";
import { AiRequestPolicy, assertAiConsent, estimateInputTokens } from "./ai-policy.js";

describe("AI request policy", () => {
  it("requires explicit consent and estimates bounded input tokens", () => {
    expect(estimateInputTokens("12345678")).toBe(2);
    expect(() => assertAiConsent(false)).toThrowError(/Explicit consent is required/);
    expect(() => assertAiConsent(true)).not.toThrow();
  });

  it("retries a transient request within the configured bound", async () => {
    const policy = new AiRequestPolicy({ timeoutMs: 100, maxRetries: 1, failureThreshold: 3, circuitOpenMs: 1_000, maxRequestsPerWindow: 10, maxInputTokensPerWindow: 100, windowMs: 60_000 });
    const request = vi.fn().mockRejectedValueOnce(Object.assign(new Error("temporary"), { statusCode: 503 })).mockResolvedValueOnce("ok");
    await expect(policy.execute({ scopeKey: "user:synthetic", inputText: "small", consentGranted: true, request })).resolves.toBe("ok");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("opens the circuit after bounded failures and enforces rate and input budgets", async () => {
    const policy = new AiRequestPolicy({ timeoutMs: 100, maxRetries: 0, failureThreshold: 2, circuitOpenMs: 60_000, maxRequestsPerWindow: 2, maxInputTokensPerWindow: 2, windowMs: 60_000 });
    const failure = () => policy.execute({ scopeKey: "user:synthetic", inputText: "1234", consentGranted: true, request: async () => { throw Object.assign(new Error("down"), { statusCode: 503 }); } });
    await expect(failure()).rejects.toMatchObject({ statusCode: 503 });
    await expect(failure()).rejects.toMatchObject({ statusCode: 503 });
    await expect(policy.execute({ scopeKey: "user:synthetic", inputText: "1", consentGranted: true, request: async () => "unreachable" })).rejects.toMatchObject({ code: "AI_CIRCUIT_OPEN" });

    const budgetPolicy = new AiRequestPolicy({ timeoutMs: 100, maxRetries: 0, failureThreshold: 3, circuitOpenMs: 1_000, maxRequestsPerWindow: 2, maxInputTokensPerWindow: 1, windowMs: 60_000 });
    await expect(budgetPolicy.execute({ scopeKey: "user:synthetic", inputText: "12345", consentGranted: true, request: async () => "never" })).rejects.toMatchObject({ code: "AI_INPUT_BUDGET" });
  });

  it("fails with timeout without exposing request content", async () => {
    const policy = new AiRequestPolicy({ timeoutMs: 10, maxRetries: 0, failureThreshold: 3, circuitOpenMs: 1_000, maxRequestsPerWindow: 2, maxInputTokensPerWindow: 100, windowMs: 60_000 });
    await expect(policy.execute({ scopeKey: "user:synthetic", inputText: "synthetic-private-content", consentGranted: true, request: () => new Promise<string>(() => undefined) })).rejects.toMatchObject({ statusCode: 504, retryable: true });
  });
});
