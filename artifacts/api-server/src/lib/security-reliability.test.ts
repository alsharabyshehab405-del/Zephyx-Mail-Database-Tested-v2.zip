import { describe, expect, it } from "vitest";
import { assertSafeAttachment, detectMagicMime, inspectOfficeOpenXml, sanitizeSecureFilename } from "./attachment-security.js";
import { featureEnabled, validateProductionSecrets } from "./production-config.js";
import { sanitizeAuditMetadata } from "./audit.js";
import { loadSmtpTimeouts, validateTimeoutRelationship, workerLeaseMs } from "./runtime-timeouts.js";

function createStoredZip(entries: Record<string, string>, encrypted = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30 + nameBuffer.length + data.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(encrypted ? 1 : 0, 6); local.writeUInt16LE(0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26); nameBuffer.copy(local, 30); data.copy(local, 30 + nameBuffer.length); locals.push(local);
    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(encrypted ? 1 : 0, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(offset, 42); nameBuffer.copy(central, 46); centrals.push(central); offset += local.length;
  }
  const directory = Buffer.concat(centrals); const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(centrals.length, 8); eocd.writeUInt16LE(centrals.length, 10); eocd.writeUInt32LE(directory.length, 12); eocd.writeUInt32LE(offset, 16); return Buffer.concat([...locals, directory, eocd]);
}

describe("security reliability v3", () => {
  it("detects magic bytes instead of trusting MIME", () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    expect(detectMagicMime(png)).toBe("image/png");
    expect(() => assertSafeAttachment(png, "image/jpeg", "photo.jpg")).toThrow(/MIME|signature/);
  });
  it("validates Office Open XML structure and rejects fake ZIP markers", () => {
    const contentTypes = "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"></Types>";
    const samples = [
      ["docx", "word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["xlsx", "xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["pptx", "ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ] as const;
    for (const [extension, root, mime] of samples) {
      const sample = createStoredZip({ "[Content_Types].xml": contentTypes, [root]: "<root/>" });
      expect(inspectOfficeOpenXml(sample)).toBe(mime);
      expect(assertSafeAttachment(sample, mime, `sample.${extension}`)).toBe(mime);
    }
    const fake = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("word/document.xml")]);
    expect(() => assertSafeAttachment(fake, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "fake.docx")).toThrow();
    const encrypted = createStoredZip({ "[Content_Types].xml": contentTypes, "word/document.xml": "<root/>" }, true);
    expect(inspectOfficeOpenXml(encrypted)).toBeNull();
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
  it("validates SMTP timeout relationship and derives a lease margin", () => {
    const timeouts = loadSmtpTimeouts({ SMTP_CONNECTION_TIMEOUT_MS: "1000", SMTP_GREETING_TIMEOUT_MS: "1500", SMTP_SOCKET_TIMEOUT_MS: "2000" });
    expect(() => validateTimeoutRelationship(timeouts, 2000)).toThrow(/strictly less/);
    expect(() => validateTimeoutRelationship(timeouts, 3000)).not.toThrow();
    expect(workerLeaseMs(3000, timeouts)).toBe(33_000);
  });
  it("rejects invalid SMTP timeout bounds", () => {
    expect(() => loadSmtpTimeouts({ SMTP_SOCKET_TIMEOUT_MS: "99" })).toThrow(/SMTP_SOCKET_TIMEOUT_MS/);
    expect(() => loadSmtpTimeouts({ SMTP_SOCKET_TIMEOUT_MS: "abc" })).toThrow(/SMTP_SOCKET_TIMEOUT_MS/);
  });
  it("requires feature keys only when the feature is enabled", () => {
    const base = { NODE_ENV: "production", JWT_ACCESS_SECRET: "a".repeat(32), JWT_REFRESH_SECRET: "b".repeat(32), SESSION_IP_HASH_SECRET: "c".repeat(32), ENABLE_2FA: "false", ENABLE_GMAIL: "false" };
    expect(() => validateProductionSecrets(base)).not.toThrow();
    expect(() => validateProductionSecrets({ ...base, ENABLE_2FA: "true" })).toThrow(/TWO_FACTOR/);
    expect(() => validateProductionSecrets({ ...base, ENABLE_GMAIL: "true" })).toThrow(/GMAIL/);
    expect(featureEnabled("ENABLE_2FA", { ENABLE_2FA: "1" })).toBe(true);
  });
});
