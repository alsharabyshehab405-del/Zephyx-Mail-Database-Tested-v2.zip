import { describe, expect, it } from "vitest";
import { assertSafeAttachment, detectMagicMime, sanitizeSecureFilename } from "./attachment-security.js";
import { featureEnabled, validateProductionSecrets } from "./production-config.js";
import { sanitizeAuditMetadata } from "./audit.js";

describe("security reliability v3", () => {
  it("detects magic bytes instead of trusting MIME", () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    expect(detectMagicMime(png)).toBe("image/png");
    expect(() => assertSafeAttachment(png, "image/jpeg", "photo.jpg")).toThrow(/MIME|signature/);
  });
  it("rejects executable and traversal filenames", () => {
    expect(sanitizeSecureFilename("../../etc/passwd")).toBe("passwd");
    expect(() => assertSafeAttachment(Buffer.from("MZunsafe"), "application/octet-stream", "x.exe")).toThrow();
  });
  it("rejects weak production secrets", () => {
    expect(() => validateProductionSecrets({ NODE_ENV: "production", JWT_ACCESS_SECRET: "short" })).toThrow(/Production security/);
    expect(() => validateProductionSecrets({ NODE_ENV: "test" })).not.toThrow();
  });
  it("redacts sensitive audit metadata without throwing", () => {
    const safe = sanitizeAuditMetadata({ password: "secret", token: "bearer", cookie: "cookie", authorization: "auth", content: "message body", statusCode: 401, attempt: false });
    expect(safe).toEqual({ statusCode: 401, attempt: false });
  });
  it("requires feature keys only when the feature is enabled", () => {
    const base = { NODE_ENV: "production", JWT_ACCESS_SECRET: "a".repeat(32), JWT_REFRESH_SECRET: "b".repeat(32), SESSION_IP_HASH_SECRET: "c".repeat(32), ENABLE_2FA: "false", ENABLE_GMAIL: "false" };
    expect(() => validateProductionSecrets(base)).not.toThrow();
    expect(() => validateProductionSecrets({ ...base, ENABLE_2FA: "true" })).toThrow(/TWO_FACTOR/);
    expect(() => validateProductionSecrets({ ...base, ENABLE_GMAIL: "true" })).toThrow(/GMAIL/);
    expect(featureEnabled("ENABLE_2FA", { ENABLE_2FA: "1" })).toBe(true);
  });
});
