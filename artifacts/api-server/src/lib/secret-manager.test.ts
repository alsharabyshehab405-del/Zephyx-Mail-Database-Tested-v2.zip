import { describe, expect, it } from "vitest";
import {
  createSecretManager,
  NotConfiguredSecretManager,
  SecretManagerNotConfiguredError,
  secretManagerStatus,
} from "./secret-manager.js";

describe("Secret Manager contract", () => {
  it("stays not configured without an explicitly wired deployment adapter", async () => {
    const manager = createSecretManager({ SECRET_MANAGER_URL: "https://example.invalid" });

    expect(manager).toBeInstanceOf(NotConfiguredSecretManager);
    expect(secretManagerStatus(manager)).toBe("not_configured");
    await expect(manager.get("smtp/password")).resolves.toBeUndefined();
    await expect(manager.metadata("smtp/password")).resolves.toMatchObject({
      name: "smtp/password",
      version: null,
      state: "not_configured",
    });
  });

  it("does not pretend to rotate or revoke a key locally", async () => {
    const manager = new NotConfiguredSecretManager();

    await expect(manager.rotate("webhook/signing-key")).rejects.toBeInstanceOf(SecretManagerNotConfiguredError);
    await expect(manager.revoke("webhook/signing-key", "v1")).rejects.toBeInstanceOf(SecretManagerNotConfiguredError);
  });
});
