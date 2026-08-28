import { describe, expect, it } from "vitest";
import { getAiProvider } from "./ai-provider.js";

describe("AI provider contract", () => {
  it("defaults to NOT_CONFIGURED without making a provider call", async () => {
    const provider = getAiProvider();
    expect(provider.state).toBe("NOT_CONFIGURED");
    await expect(provider.compose({ userId: "synthetic-user", text: "synthetic", consentGranted: true, operation: "draft" })).rejects.toMatchObject({ statusCode: 503, providerState: "NOT_CONFIGURED" });
  });
});
