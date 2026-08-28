import { describe, expect, it } from "vitest";
import { redactAiText } from "./ai.redaction.js";

describe("AI input redaction", () => {
  it("redacts email, phone, payment-like numbers and credentials", () => {
    const value = redactAiText("Contact alice@example.invalid or +1 (555) 123-4567. Card 4111 1111 1111 1111 password=secret123");
    expect(value).not.toContain("alice@example.invalid");
    expect(value).not.toContain("555");
    expect(value).not.toContain("4111 1111 1111 1111");
    expect(value).not.toContain("secret123");
    expect(value).toContain("[redacted-email]");
    expect(value).toContain("[redacted-phone]");
    expect(value).toContain("[redacted-number]");
    expect(value).toContain("password: [redacted]");
  });

  it("bounds the prompt text", () => {
    expect(redactAiText("x".repeat(500), 120)).toHaveLength(120);
  });
});
