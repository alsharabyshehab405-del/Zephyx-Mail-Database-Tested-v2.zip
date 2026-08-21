import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const IV_LENGTH = 12;

function readEncryptionSecret(): string {
  const value = process.env["GMAIL_TOKEN_ENCRYPTION_KEY"]?.trim();

  if (!value) {
    throw Object.assign(
      new Error("Gmail integration is not configured: GMAIL_TOKEN_ENCRYPTION_KEY is missing"),
      { statusCode: 503 },
    );
  }

  return value;
}

function decodeConfiguredKey(value: string): Buffer {
  if (/^[0-9a-f]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64");

    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to the passphrase form below.
  }

  if (value.length < 32) {
    throw Object.assign(
      new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value, 64 hex characters, or a passphrase of at least 32 characters"),
      { statusCode: 503 },
    );
  }

  return createHash("sha256").update(value, "utf8").digest();
}

export function getTokenEncryptionKey(): Buffer {
  return decodeConfiguredKey(readEncryptionSecret());
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function encryptGmailToken(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [ENCRYPTION_VERSION, toBase64Url(iv), toBase64Url(tag), toBase64Url(ciphertext)].join(".");
}

export function decryptGmailToken(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = value.split(".");

  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra.length > 0
  ) {
    throw Object.assign(new Error("Stored Gmail token has an unsupported format"), {
      statusCode: 500,
    });
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getTokenEncryptionKey(),
      fromBase64Url(ivValue),
    );
    decipher.setAuthTag(fromBase64Url(tagValue));

    return Buffer.concat([
      decipher.update(fromBase64Url(ciphertextValue)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw Object.assign(new Error("Stored Gmail token could not be decrypted"), {
      statusCode: 500,
    });
  }
}

export function deriveGmailOAuthStateSecret(): string {
  return createHash("sha256")
    .update("NovaMail Gmail OAuth state v1", "utf8")
    .update(getTokenEncryptionKey())
    .digest("hex");
}
