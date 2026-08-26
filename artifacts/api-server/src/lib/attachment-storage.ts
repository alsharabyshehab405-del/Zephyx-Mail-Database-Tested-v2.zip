import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
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
      `Attachment storage is unavailable${suffix}. Configure the isolated staging S3 bucket or attach Replit App Storage before enabling attachment uploads.`,
    ),
    {
      statusCode: 503,
      cause,
    },
  );
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.$metadata?.httpStatusCode === 404 || /notfound|nosuchkey|does not exist/i.test(candidate.name ?? "");
}

function parseBoolean(value: string, name: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw storageUnavailableError(new Error(`${name} must be true or false`));
}

function readS3StorageConfig(): S3StorageConfig | null {
  const endpoint = process.env["S3_ENDPOINT"]?.trim() ?? "";
  const region = process.env["S3_REGION"]?.trim() ?? "";
  const bucket = process.env["S3_BUCKET"]?.trim() ?? "";
  const accessKeyId = process.env["S3_ACCESS_KEY"]?.trim() ?? "";
  const secretAccessKey = process.env["S3_SECRET_KEY"]?.trim() ?? "";
  const forcePathStyle = process.env["S3_FORCE_PATH_STYLE"]?.trim() ?? "";
  const anyConfigured = [endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle].some(Boolean);

  if (!anyConfigured) return null;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !forcePathStyle) {
    throw storageUnavailableError(new Error("S3 Object Storage configuration is incomplete"));
  }

  try {
    new URL(endpoint);
  } catch {
    throw storageUnavailableError(new Error("S3_ENDPOINT must be a valid URL"));
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: parseBoolean(forcePathStyle, "S3_FORCE_PATH_STYLE"),
  };
}

function createS3Client(config: S3StorageConfig): AppStorageClient {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async init(): Promise<void> {
      return undefined;
    },
    async uploadFromText(objectName, contents): Promise<StorageResult<null>> {
      try {
        await client.send(new PutObjectCommand({
          Bucket: config.bucket,
          Key: objectName,
          Body: contents,
          ContentType: "text/plain; charset=utf-8",
        }));
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, error };
      }
    },
    async downloadAsText(objectName): Promise<StorageResult<string>> {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectName }));
        if (!response.Body) return { ok: false, error: new Error("S3 object response did not contain a body") };
        return { ok: true, value: Buffer.from(await response.Body.transformToByteArray()).toString("utf8") };
      } catch (error) {
        return { ok: false, error };
      }
    },
    async exists(objectName): Promise<StorageResult<boolean>> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectName }));
        return { ok: true, value: true };
      } catch (error) {
        if (isNotFoundError(error)) return { ok: true, value: false };
        return { ok: false, error };
      }
    },
    async delete(objectName): Promise<StorageResult<null>> {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectName }));
        return { ok: true, value: null };
      } catch (error) {
        if (isNotFoundError(error)) return { ok: true, value: null };
        return { ok: false, error };
      }
    },
  };
}

async function createClient(): Promise<AppStorageClient> {
  const s3Config = readS3StorageConfig();
  if (s3Config) return createS3Client(s3Config);

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
      "Object Storage could not be initialized",
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

function safeKeySegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error(`${label} is invalid for an attachment object key`);
  }
  return normalized;
}

function storageEnvironment(): string {
  return safeKeySegment(process.env["STAGING_ENVIRONMENT"]?.trim() || process.env["NODE_ENV"]?.trim() || "unknown", "storage environment");
}

export function attachmentStorageKey(
  attachmentId: string,
  ownerUserId: string,
  organizationId = "personal",
): string {
  return [
    storageEnvironment(),
    "organizations",
    safeKeySegment(organizationId, "organization id"),
    "users",
    safeKeySegment(ownerUserId, "user id"),
    "attachments",
    safeKeySegment(attachmentId, "attachment id"),
  ].join("/");
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

    if (/not[ -]?found|404|does not exist|nosuchkey/i.test(message)) {
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

    if (/not[ -]?found|404|does not exist|nosuchkey/i.test(message)) {
      return;
    }

    throw storageUnavailableError(
      new Error(`Deleting ${storageKey} failed: ${message}`),
    );
  }
}

export async function verifyAttachmentStorage(): Promise<void> {
  const probeId = `health-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storageKey = `${storageEnvironment()}/health/${probeId}`;
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
