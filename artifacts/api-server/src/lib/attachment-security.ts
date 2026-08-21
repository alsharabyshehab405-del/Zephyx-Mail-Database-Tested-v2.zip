import path from "node:path";

export type AttachmentScannerVerdict = "clean" | "infected" | "error";

export interface AttachmentScanner {
  scan(contents: Buffer, filename: string): Promise<AttachmentScannerVerdict>;
}

/** Production integration point. Configure a real ClamAV-backed implementation externally. */
export class ClamAvAttachmentScanner implements AttachmentScanner {
  async scan(_contents: Buffer, _filename: string): Promise<AttachmentScannerVerdict> {
    throw new Error("ClamAV scanner is not configured");
  }
}

/** Deterministic scanner for tests only; never selected by production configuration. */
export class AllowAllTestAttachmentScanner implements AttachmentScanner {
  async scan(_contents: Buffer, _filename: string): Promise<AttachmentScannerVerdict> {
    return "clean";
  }
}

const signatures: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/gzip", bytes: [0x1f, 0x8b] },
];

export function sanitizeSecureFilename(value: string | undefined): string {
  const normalized = (value ?? "attachment").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "");
  const basename = path.basename(normalized.replace(/[\\/]+/g, "/"));
  const safe = basename.replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().replace(/^\.+$/, "");
  return (safe || "attachment").slice(0, 240);
}

export function detectMagicMime(contents: Buffer): string | null {
  for (const signature of signatures) {
    if (signature.bytes.every((byte, index) => contents[index] === byte)) return signature.mime;
  }
  if (contents.length >= 4 && contents.subarray(0, 4).toString("ascii") === "RIFF" && contents.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (contents.length >= 2 && contents[0] === 0x4d && contents[1] === 0x5a) return "application/x-dosexec";
  return null;
}

export function assertSafeAttachment(contents: Buffer, declaredMime: string | undefined, filename: string): string {
  const detected = detectMagicMime(contents);
  if (!detected) throw Object.assign(new Error("Unsupported or unrecognized attachment format"), { statusCode: 415 });
  if (detected === "application/x-dosexec" || detected === "text/html" || detected === "image/svg+xml") {
    throw Object.assign(new Error("Unsafe attachment format"), { statusCode: 415 });
  }
  const declared = (declaredMime ?? "").split(";", 1)[0].trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== detected) {
    throw Object.assign(new Error("Attachment MIME does not match its file signature"), { statusCode: 415 });
  }
  const safeName = sanitizeSecureFilename(filename);
  const extension = path.extname(safeName).toLowerCase();
  const expected = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".gif", "image/gif"], [".pdf", "application/pdf"], [".zip", "application/zip"], [".gz", "application/gzip"], [".webp", "image/webp"]]).get(extension);
  if (expected && expected !== detected) throw Object.assign(new Error("Attachment extension does not match its file signature"), { statusCode: 415 });
  return detected;
}

export const productionAttachmentScanner: AttachmentScanner = new ClamAvAttachmentScanner();
export const testAttachmentScanner: AttachmentScanner = new AllowAllTestAttachmentScanner();

export function getAttachmentScanner(): AttachmentScanner {
  return process.env.NODE_ENV === "test" ? testAttachmentScanner : productionAttachmentScanner;
}

export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_ATTACHMENT_SIZE_V3 = 25 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_SIZE_V3 = 50 * 1024 * 1024;

export function assertAttachmentCount(count: number): void {
  if (count > MAX_ATTACHMENT_COUNT) throw Object.assign(new Error("Too many attachments"), { statusCode: 413 });
}

export async function scanAttachment(contents: Buffer, filename: string): Promise<void> {
  const verdict = await getAttachmentScanner().scan(contents, filename);
  if (verdict === "infected") throw Object.assign(new Error("Attachment rejected by malware scanner"), { statusCode: 422 });
  if (verdict === "error") throw Object.assign(new Error("Attachment scanner unavailable"), { statusCode: 503 });
}
