import net from "node:net";
import { describe, expect, it } from "vitest";
import { ClamAvInstreamScanner, FakeAntivirusScanner, createAntivirusScanner, createPushAdapter } from "./external-adapters.js";
import { validateProductionSecrets } from "./production-config.js";

describe("Production Launch v6 configuration", () => {
  it("fails closed for an insecure production origin and weak secret", () => {
    expect(() => validateProductionSecrets({
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: "weak",
      JWT_REFRESH_SECRET: "weak",
      SESSION_IP_HASH_SECRET: "weak",
      APP_BASE_URL: "http://example.test",
      NOVAMAIL_WEB_URL: "http://example.test",
      ALLOWED_ORIGINS: "*",
      TRUST_PROXY: "1",
      REQUEST_BODY_LIMIT_BYTES: "10485760",
    })).toThrow(/Production security configuration invalid/);
  });

  it("accepts a complete production baseline with disabled optional providers", () => {
    expect(() => validateProductionSecrets({
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: "a".repeat(40),
      JWT_REFRESH_SECRET: "b".repeat(40),
      SESSION_IP_HASH_SECRET: "c".repeat(40),
      APP_BASE_URL: "https://mail.example.test",
      NOVAMAIL_WEB_URL: "https://mail.example.test",
      ALLOWED_ORIGINS: "https://mail.example.test",
      TRUST_PROXY: "1",
      REQUEST_BODY_LIMIT_BYTES: "10485760",
      ENABLE_2FA: "false",
      ENABLE_GMAIL: "false",
      ENABLE_NOTIFICATIONS: "false",
      FCM_ENABLED: "false",
      WEB_PUSH_ENABLED: "false",
      ATTACHMENT_SCANNING_ENABLED: "false",
    })).not.toThrow();
  });

  it("rejects partial or unsafe optional security providers in production", () => {
    const baseline = {
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: "a".repeat(40),
      JWT_REFRESH_SECRET: "b".repeat(40),
      SESSION_IP_HASH_SECRET: "c".repeat(40),
      APP_BASE_URL: "https://mail.example.test",
      NOVAMAIL_WEB_URL: "https://mail.example.test",
      ALLOWED_ORIGINS: "https://mail.example.test",
      TRUST_PROXY: "1",
      REQUEST_BODY_LIMIT_BYTES: "10485760",
      ENABLE_2FA: "false",
      ENABLE_GMAIL: "false",
      ENABLE_NOTIFICATIONS: "false",
      FCM_ENABLED: "false",
      WEB_PUSH_ENABLED: "false",
      ATTACHMENT_SCANNING_ENABLED: "false",
    };
    expect(() => validateProductionSecrets({ ...baseline, THREAT_ANALYSIS_PROVIDER: "provider" })).toThrow(/THREAT_ANALYSIS_API_URL is required/);
    expect(() => validateProductionSecrets({ ...baseline, THREAT_ANALYSIS_PROVIDER: "provider", THREAT_ANALYSIS_API_URL: "http://provider.example.test", THREAT_ANALYSIS_API_KEY: "production-provider-key" })).toThrow(/THREAT_ANALYSIS_API_URL must use https/);
    expect(() => validateProductionSecrets({ ...baseline, ATTACHMENT_SANDBOX_PROVIDER: "sandbox", ATTACHMENT_SANDBOX_API_URL: "https://sandbox.example.test", ATTACHMENT_SANDBOX_API_KEY: "production-sandbox-key", ATTACHMENT_SANDBOX_ENVIRONMENT: "staging" })).toThrow(/staging-only/);
  });

  it("uses fake and not-configured adapters without credentials", () => {
    expect(createAntivirusScanner({ NODE_ENV: "test" })).toBeInstanceOf(FakeAntivirusScanner);
    expect(createPushAdapter({ NODE_ENV: "test" })).toBeDefined();
    expect(createAntivirusScanner({ NODE_ENV: "production", ATTACHMENT_SCANNING_ENABLED: "false" })).toBeDefined();
  });

  it("parses a real ClamAV INSTREAM OK response", async () => {
    const server = net.createServer((socket) => {
      socket.on("data", () => {
        socket.end("stream: OK\\n");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    try {
      const result = await new ClamAvInstreamScanner("127.0.0.1", address.port).scan(Buffer.from("safe"));
      expect(result).toEqual({ clean: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
