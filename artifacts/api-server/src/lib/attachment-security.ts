import net from "node:net";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { getAttachmentSandboxProvider } from "./attachment-sandbox.js";

export type AttachmentScannerVerdict = "clean" | "infected" | "error";
export interface AttachmentScanner { scan(contents: Buffer, filename: string): Promise<AttachmentScannerVerdict>; }

export class ClamAvAttachmentScanner implements AttachmentScanner {
  async scan(contents: Buffer, _filename: string): Promise<AttachmentScannerVerdict> {
    const host = process.env.CLAMAV_HOST?.trim();
    const port = Number(process.env.CLAMAV_PORT ?? "3310");
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return "error";
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => { socket.destroy(); resolve("error"); }, 15_000);
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("error", () => { clearTimeout(timer); resolve("error"); });
      socket.on("close", () => {
        clearTimeout(timer);
        const result = Buffer.concat(chunks).toString("utf8").replace(/\0+$/g, "").trim();
        if (/FOUND/i.test(result)) resolve("infected"); else if (/OK\s*$/i.test(result)) resolve("clean"); else resolve("error");
      });
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < contents.length; offset += 1024 * 1024) {
        const chunk = contents.subarray(offset, Math.min(offset + 1024 * 1024, contents.length));
        const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length, 0); socket.write(size); socket.write(chunk);
      }
      socket.write(Buffer.alloc(4)); socket.end();
    });
  }
}
export class AllowAllTestAttachmentScanner implements AttachmentScanner { async scan(): Promise<AttachmentScannerVerdict> { return "clean"; } }

const signatures: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];
const officeMimeByRoot = new Map([
  ["word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
]);
const ZIP_MAX_ENTRIES = 100;
const ZIP_MAX_COMPRESSED = 25 * 1024 * 1024;
const ZIP_MAX_UNCOMPRESSED = 50 * 1024 * 1024;
const ZIP_MAX_RATIO = 100;

type ZipEntry = { name: string; compression: number; flags: number; compressedSize: number; uncompressedSize: number; localOffset: number };
function u16(buffer: Buffer, offset: number): number { return buffer.readUInt16LE(offset); }
function u32(buffer: Buffer, offset: number): number { return buffer.readUInt32LE(offset); }
function parseZipEntries(buffer: Buffer): ZipEntry[] | null {
  const start = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) if (u32(buffer, offset) === 0x06054b50) { eocd = offset; break; }
  if (eocd < 0 || eocd + 22 > buffer.length) return null;
  const count = u16(buffer, eocd + 10);
  const directorySize = u32(buffer, eocd + 12);
  const directoryOffset = u32(buffer, eocd + 16);
  if (!count || count > ZIP_MAX_ENTRIES || directoryOffset + directorySize > buffer.length) return null;
  const entries: ZipEntry[] = [];
  let offset = directoryOffset;
  let compressedTotal = 0;
  let uncompressedTotal = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || u32(buffer, offset) !== 0x02014b50) return null;
    const flags = u16(buffer, offset + 8);
    const compression = u16(buffer, offset + 10);
    const compressedSize = u32(buffer, offset + 20);
    const uncompressedSize = u32(buffer, offset + 24);
    const nameLength = u16(buffer, offset + 28);
    const extraLength = u16(buffer, offset + 30);
    const commentLength = u16(buffer, offset + 32);
    const localOffset = u32(buffer, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > buffer.length || (flags & 0x1) !== 0 || compression !== 0 && compression !== 8) return null;
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.includes("\\") || name.split("/").some((part) => part === "..")) return null;
    if (/\.zip$/i.test(name) || /(^|\/)(?:embeddings|media)\/.*\.(?:zip|7z|rar)$/i.test(name)) return null;
    compressedTotal += compressedSize; uncompressedTotal += uncompressedSize;
    if (compressedTotal > ZIP_MAX_COMPRESSED || uncompressedTotal > ZIP_MAX_UNCOMPRESSED || (compressedSize > 0 && uncompressedSize / compressedSize > ZIP_MAX_RATIO)) return null;
    entries.push({ name, compression, flags, compressedSize, uncompressedSize, localOffset });
    offset = end;
  }
  return entries;
}
function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer | null {
  const offset = entry.localOffset;
  if (offset + 30 > buffer.length || u32(buffer, offset) !== 0x04034b50) return null;
  const nameLength = u16(buffer, offset + 26);
  const extraLength = u16(buffer, offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > buffer.length) return null;
  const compressed = buffer.subarray(start, end);
  try {
    const data = entry.compression === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: ZIP_MAX_UNCOMPRESSED });
    return data.length === entry.uncompressedSize ? data : null;
  } catch { return null; }
}
export function inspectOfficeOpenXml(contents: Buffer): string | null {
  if (contents.length < 4 || contents.readUInt32LE(0) !== 0x04034b50) return null;
  const entries = parseZipEntries(contents);
  if (!entries || !entries.some((entry) => entry.name === "[Content_Types].xml")) return null;
  for (const [root, mime] of officeMimeByRoot) {
    const entry = entries.find((candidate) => candidate.name === root);
    if (!entry) continue;
    const types = entries.find((candidate) => candidate.name === "[Content_Types].xml");
    if (!types || !readZipEntry(contents, types) || !readZipEntry(contents, entry)) continue;
    return mime;
  }
  return null;
}

export function sanitizeSecureFilename(value: string | undefined): string {
  const normalized = (value ?? "attachment").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "");
  const basename = path.basename(normalized.replace(/[\\/]+/g, "/"));
  const safe = basename.replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().replace(/^\.+$/, "");
  return (safe || "attachment").slice(0, 240);
}
function isLikelyUtf8Text(contents: Buffer): boolean {
  if (contents.length === 0 || contents.includes(0)) return false;
  try { new TextDecoder("utf-8", { fatal: true }).decode(contents.subarray(0, Math.min(contents.length, 4096))); return true; } catch { return false; }
}
export function detectMagicMime(contents: Buffer): string | null {
  for (const signature of signatures) if (signature.bytes.every((byte, index) => contents[index] === byte)) return signature.mime;
  if (contents.length >= 12 && contents.subarray(0, 4).toString("ascii") === "RIFF" && contents.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (contents.length >= 2 && contents[0] === 0x4d && contents[1] === 0x5a) return "application/x-dosexec";
  if (contents.length >= 4 && contents.readUInt32LE(0) === 0x04034b50) return inspectOfficeOpenXml(contents) ?? "application/zip";
  if (isLikelyUtf8Text(contents)) return "text/plain";
  return null;
}
export function assertSafeAttachment(contents: Buffer, declaredMime: string | undefined, filename: string): string {
  const detected = detectMagicMime(contents);
  if (!detected || detected === "application/zip" || detected === "application/x-dosexec") throw Object.assign(new Error("Unsupported or unrecognized attachment format"), { statusCode: 415 });
  const declared = (declaredMime ?? "").split(";", 1)[0].trim().toLowerCase();
  const textDeclared = declared === "text/plain" || declared === "text/csv" || declared === "application/csv";
  if (declared && declared !== "application/octet-stream" && declared !== detected && !(textDeclared && detected === "text/plain")) throw Object.assign(new Error("Attachment MIME does not match its file signature"), { statusCode: 415 });
  const safeName = sanitizeSecureFilename(filename);
  const expected = new Map([
    [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".gif", "image/gif"], [".pdf", "application/pdf"], [".webp", "image/webp"],
    [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"], [".txt", "text/plain"], [".csv", "text/plain"],
  ]).get(path.extname(safeName).toLowerCase());
  if (expected && expected !== detected && !(expected === "text/plain" && detected === "text/plain")) throw Object.assign(new Error("Attachment extension does not match its file signature"), { statusCode: 415 });
  return detected;
}
export const productionAttachmentScanner: AttachmentScanner = new ClamAvAttachmentScanner();
export const testAttachmentScanner: AttachmentScanner = new AllowAllTestAttachmentScanner();
export function attachmentScanningEnabled(env: NodeJS.ProcessEnv = process.env): boolean { return env.NODE_ENV === "test" || env.ATTACHMENT_SCANNING_ENABLED?.trim().toLowerCase() === "true"; }
export function getAttachmentScanner(): AttachmentScanner { return process.env.NODE_ENV === "test" ? testAttachmentScanner : productionAttachmentScanner; }
export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_ATTACHMENT_SIZE_V3 = 25 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_SIZE_V3 = 50 * 1024 * 1024;
export function assertAttachmentCount(count: number): void { if (count > MAX_ATTACHMENT_COUNT) throw Object.assign(new Error("Too many attachments"), { statusCode: 413 }); }
export function attachmentScannerName(): string {
  return process.env.NODE_ENV === "test" ? "test-allow-all" : "clamav-instream";
}

export async function scanAttachment(contents: Buffer, filename: string): Promise<"clean"> {
  if (!attachmentScanningEnabled()) throw Object.assign(new Error("Attachment uploads are disabled until malware scanning is configured"), { statusCode: 503 });
  const verdict = await getAttachmentScanner().scan(contents, filename);
  if (verdict === "infected") throw Object.assign(new Error("Attachment rejected by malware scanner"), { statusCode: 422 });
  if (verdict === "error") throw Object.assign(new Error("Attachment scanner unavailable"), { statusCode: 503 });
  const sandbox = getAttachmentSandboxProvider();
  if (sandbox) {
    const sandboxVerdict = await sandbox.scan({ filename, mimeType: detectMagicMime(contents) ?? "application/octet-stream", contents });
    if (sandboxVerdict === "unsafe") throw Object.assign(new Error("Attachment rejected by staging sandbox"), { statusCode: 422 });
    if (sandboxVerdict === "error") throw Object.assign(new Error("Attachment sandbox unavailable"), { statusCode: 503 });
  }
  return "clean";
}
