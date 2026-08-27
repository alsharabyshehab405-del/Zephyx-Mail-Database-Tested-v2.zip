import { afterEach, describe, expect, it } from "vitest";
import { clearWebhookReplayStateForTests, signWebhookPayload, verifyWebhookSignature } from "./webhook-signature.js";

describe("webhook signature contract", () => {
  afterEach(() => clearWebhookReplayStateForTests());

  it("accepts a fresh signed payload once", () => {
    const now = 1_700_000_000_000;
    const signed = signWebhookPayload("local-test-secret", '{"event":"incident.created"}', now, "00000000-0000-4000-8000-000000000001");
    expect(verifyWebhookSignature("local-test-secret", '{"event":"incident.created"}', signed.timestamp, signed.nonce, signed.signature, now)).toBe(true);
    expect(verifyWebhookSignature("local-test-secret", '{"event":"incident.created"}', signed.timestamp, signed.nonce, signed.signature, now)).toBe(false);
  });

  it("rejects tampering, wrong secrets, and stale timestamps", () => {
    const now = 1_700_000_000_000;
    const signed = signWebhookPayload("local-test-secret", "payload", now, "00000000-0000-4000-8000-000000000002");
    expect(verifyWebhookSignature("local-test-secret", "tampered", signed.timestamp, signed.nonce, signed.signature, now)).toBe(false);
    expect(verifyWebhookSignature("wrong-secret", "payload", signed.timestamp, "00000000-0000-4000-8000-000000000003", signWebhookPayload("local-test-secret", "payload", now, "00000000-0000-4000-8000-000000000003").signature, now)).toBe(false);
    expect(verifyWebhookSignature("local-test-secret", "payload", signed.timestamp, "00000000-0000-4000-8000-000000000004", signWebhookPayload("local-test-secret", "payload", now, "00000000-0000-4000-8000-000000000004").signature, now + 6 * 60_000)).toBe(false);
  });
});
