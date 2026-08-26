import { describe, expect, it } from "vitest";
import { attachmentSandboxConfigForTests, attachmentSandboxStatus, getAttachmentSandboxProvider } from "./attachment-sandbox.js";

describe("staging attachment sandbox", () => {
  it("remains NOT_CONFIGURED without a real provider", () => {
    expect(attachmentSandboxConfigForTests({ NODE_ENV: "staging", ATTACHMENT_SANDBOX_ENVIRONMENT: "staging" })).toBeNull();
    expect(attachmentSandboxStatus({ NODE_ENV: "staging", ATTACHMENT_SANDBOX_ENVIRONMENT: "staging" })).toEqual({ state: "NOT_CONFIGURED", provider: null, environment: "none" });
  });

  it("does not enable a sandbox outside staging", () => {
    const env = { NODE_ENV: "development", ATTACHMENT_SANDBOX_ENVIRONMENT: "development", ATTACHMENT_SANDBOX_PROVIDER: "local", ATTACHMENT_SANDBOX_API_URL: "http://127.0.0.1:9000/scan", ATTACHMENT_SANDBOX_API_KEY: "test-only" };
    expect(getAttachmentSandboxProvider(env)).toBeNull();
    expect(attachmentSandboxStatus(env)).toMatchObject({ state: "NOT_CONFIGURED" });
  });

  it("accepts only a complete staging endpoint", () => {
    expect(attachmentSandboxConfigForTests({ NODE_ENV: "staging", ATTACHMENT_SANDBOX_ENVIRONMENT: "staging", ATTACHMENT_SANDBOX_PROVIDER: "sandbox", ATTACHMENT_SANDBOX_API_URL: "https://sandbox.example.test/scan", ATTACHMENT_SANDBOX_API_KEY: "test-only" })).not.toBeNull();
  });
});
