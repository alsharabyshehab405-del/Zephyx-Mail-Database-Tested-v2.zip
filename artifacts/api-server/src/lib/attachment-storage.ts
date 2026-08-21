import { Client as ReplitStorageClient } from "@replit/object-storage";
import { logger } from "./logger.js";

type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown; value?: undefined };

type AppStorageClient = {
  init(bucketId?: string): Promise<unknown>;
  uploadFromText(
    objectName: string,
    contents: string,
    options?: Record<string, unknown>,
  ): Promise<StorageResult<null>>;
  downloadAsText(
    objectName: string,
    options?: Record<string, unknown>,
  ): Promise<StorageResult<string>>;
  exists(objectName: string): Promise<StorageResult<boolean>>;
  delete(
    objectName: string,
    options?: Record<string, unknown>,
  ): Promise<StorageResult<null>>;
};

const memoryObjects = new Map<string, Buffer>();
let clientPromise: Promise<AppStorageClient> | null = null;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown App Storage error";
  }
}

function storageUnavailableError(cause?: unknown) {
  const suffix = cause ? `: ${errorText(cause)}` : "";

  return Object.assign(
    new Error(
      `Attachment storage is unavailable${suffix}. Open Replit Tools → App Storage, create or attach a bucket, then run the Zephyx Mail attachment installer again.`,
    ),
    {
      statusCode: 503,
      cause,
    },
  );
}

async function createClient(): Promise<AppStorageClient> {
  try {
    const client = new ReplitStorageClient() as unknown as AppStorageClient;
    const bucketId =
      process.env["REPLIT_OBJECT_STORAGE_BUCKET_ID"]?.trim() ||
      process.env["APP_STORAGE_BUCKET_ID"]?.trim() ||
      undefined;

    await client.init(bucketId);
    return client;
  } catch (error) {
    logger.error(
      {
        errorName: error instanceof Error ? error.name : "unknown",
      },
      "Replit App Storage could not be initialized",
    );
    throw storageUnavailableError(error);
  }
}

async function getClient(): Promise<AppStorageClient> {
  clientPromise ??= createClient();

  try {
    return await clientPromise;
  } catch (error) {
    clientPromise = null;
    throw error;
  }
}

function unwrap<T>(result: StorageResult<T>, operation: string): T {
  if (!result.ok) {
    throw storageUnavailableError(
      new Error(`${operation} failed: ${errorText(result.error)}`),
    );
  }

  return result.value;
}

export function attachmentStorageKey(attachmentId: string): string {
  return `novamail/email-attachments/${attachmentId}`;
}

export async function writeAttachmentObject(
  storageKey: string,
  contents: Buffer,
): Promise<void> {
  if (process.env["NODE_ENV"] === "test") {
    memoryObjects.set(storageKey, Buffer.from(contents));
    return;
  }

  const client = await getClient();
  const encoded = `NOVAMAIL_B64_V1:${contents.toString("base64")}`;

  unwrap(
    await client.uploadFromText(storageKey, encoded),
    `Uploading ${storageKey}`,
  );
}

export async function readAttachmentObject(storageKey: string): Promise<Buffer> {
  if (process.env["NODE_ENV"] === "test") {
    const value = memoryObjects.get(storageKey);

    if (!value) {
      throw Object.assign(new Error("Attachment data was not found"), {
        statusCode: 404,
      });
    }

    return Buffer.from(value);
  }

  const client = await getClient();
  const result = await client.downloadAsText(storageKey);

  if (!result.ok) {
    const message = errorText(result.error);

    if (/not[ -]?found|404|does not exist/i.test(message)) {
      throw Object.assign(new Error("Attachment data was not found"), {
        statusCode: 404,
      });
    }

    throw storageUnavailableError(
      new Error(`Downloading ${storageKey} failed: ${message}`),
    );
  }

  const prefix = "NOVAMAIL_B64_V1:";

  if (!result.value.startsWith(prefix)) {
    throw Object.assign(
      new Error(
        "This attachment was stored by the old broken byte uploader and cannot be recovered. Attach the original file again.",
      ),
      { statusCode: 410 },
    );
  }

  return Buffer.from(result.value.slice(prefix.length), "base64");
}

export async function attachmentObjectExists(storageKey: string): Promise<boolean> {
  if (process.env["NODE_ENV"] === "test") {
    return memoryObjects.has(storageKey);
  }

  const client = await getClient();
  return unwrap(await client.exists(storageKey), `Checking ${storageKey}`);
}

export async function deleteAttachmentObject(storageKey: string): Promise<void> {
  if (process.env["NODE_ENV"] === "test") {
    memoryObjects.delete(storageKey);
    return;
  }

  const client = await getClient();
  const result = await client.delete(storageKey);

  if (!result.ok) {
    const message = errorText(result.error);

    if (/not[ -]?found|404|does not exist/i.test(message)) {
      return;
    }

    throw storageUnavailableError(
      new Error(`Deleting ${storageKey} failed: ${message}`),
    );
  }
}

export async function verifyAttachmentStorage(): Promise<void> {
  const probeId = `health-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storageKey = `novamail/health/${probeId}`;
  const probe = Buffer.from("novamail-app-storage-ok", "utf8");

  await writeAttachmentObject(storageKey, probe);

  try {
    const downloaded = await readAttachmentObject(storageKey);

    if (!downloaded.equals(probe)) {
      throw storageUnavailableError(
        new Error("App Storage verification returned different bytes"),
      );
    }
  } finally {
    await deleteAttachmentObject(storageKey).catch((error) => {
      logger.warn({ err: error }, "Could not remove App Storage verification object");
    });
  }
}
