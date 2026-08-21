import { describe, expect, it } from "vitest";
import { assertSafeAttachment, detectMagicMime, sanitizeSecureFilename } from "./attachment-security.js";
import { validateProductionSecrets } from "./production-config.js";

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
});
