import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Client as StorageClient } from "@replit/object-storage";

const { Pool } = pg;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const NEW_URL = /^\/api\/emails\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const LEGACY_STORED_NAME = /^[a-f0-9-]{36}(?:\.[a-z0-9]{1,10})?$/i;

function unwrap(result, operation) {
  if (!result?.ok) {
    const error = result?.error;
    const message = error instanceof Error ? error.message : String(error ?? "unknown error");
    throw new Error(`${operation} failed: ${message}`);
  }
  return result.value;
}

function normalizeUrl(value) {
  try {
    return new URL(value, "http://novamail.local").pathname;
  } catch {
    return "";
  }
}

function sanitizeFilename(value) {
  const normalized = String(value || "attachment")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    .trim();
  return (normalized || "attachment").slice(0, 240);
}

function sanitizeMimeType(value) {
  const normalized = String(value || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)
    ? normalized
    : "application/octet-stream";
}

async function firstExistingFile(paths) {
  for (const path of paths) {
    try {
      const info = await stat(path);
      if (info.isFile()) return path;
    } catch {
      // Try the next legacy location.
    }
  }
  return null;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing; legacy attachment migration cannot run.");
  process.exit(1);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "../../..");
const legacyDirectories = [
  join(workspaceRoot, "uploads", "email-attachments"),
  join(workspaceRoot, "artifacts", "api-server", "uploads", "email-attachments"),
  resolve(scriptDirectory, "../uploads/email-attachments"),
];

const bucketId =
  process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID?.trim() ||
  process.env.APP_STORAGE_BUCKET_ID?.trim() ||
  undefined;
const storage = new StorageClient();
await storage.init(bucketId);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
let migrated = 0;
let alreadyReady = 0;
let missing = 0;
let oversized = 0;

try {
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_attachment_objects (
      id text PRIMARY KEY NOT NULL,
      owner_user_id text REFERENCES users(id) ON DELETE SET NULL,
      storage_key text NOT NULL UNIQUE,
      filename varchar(998) NOT NULL,
      mime_type varchar(255) DEFAULT 'application/octet-stream' NOT NULL,
      size integer NOT NULL,
      checksum_sha256 varchar(64) NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_attachment_objects_owner_idx
      ON email_attachment_objects(owner_user_id);
    CREATE INDEX IF NOT EXISTS email_attachment_objects_created_idx
      ON email_attachment_objects(created_at);

    CREATE TABLE IF NOT EXISTS email_attachment_migration_backup_20260804 (
      email_id text PRIMARY KEY NOT NULL,
      attachments jsonb NOT NULL,
      backed_up_at timestamp with time zone DEFAULT now() NOT NULL
    );

    INSERT INTO email_attachment_migration_backup_20260804 (email_id, attachments)
    SELECT id, COALESCE(attachments, '[]'::jsonb)
    FROM emails
    WHERE jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0
    ON CONFLICT (email_id) DO NOTHING;
  `);

  const { rows: emailRows } = await db.query(`
    SELECT id, user_id, COALESCE(attachments, '[]'::jsonb) AS attachments
    FROM emails
    WHERE jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0
    ORDER BY created_at ASC
  `);

  const backupCountResult = await db.query(
    `SELECT count(*)::integer AS count FROM email_attachment_migration_backup_20260804`,
  );
  const attachmentMetadataBackupRows = Number(backupCountResult.rows[0]?.count ?? 0);

  const existingObjects = await db.query(`SELECT id FROM email_attachment_objects`);
  const existingIds = new Set(existingObjects.rows.map((row) => row.id));
  const migratedByLegacyUrl = new Map();

  for (const email of emailRows) {
    const attachments = Array.isArray(email.attachments) ? email.attachments : [];
    let changed = false;
    const nextAttachments = [];

    for (const attachment of attachments) {
      const rawUrl = typeof attachment?.url === "string" ? attachment.url : "";
      const pathname = normalizeUrl(rawUrl);
      const readyMatch = NEW_URL.exec(pathname);

      if (readyMatch && existingIds.has(readyMatch[1])) {
        alreadyReady += 1;
        nextAttachments.push(attachment);
        continue;
      }

      const priorMigration = migratedByLegacyUrl.get(pathname);
      if (priorMigration) {
        nextAttachments.push(priorMigration);
        changed = true;
        continue;
      }

      const storedName = basename(pathname);
      if (!pathname.startsWith("/api/emails/attachments/") || !LEGACY_STORED_NAME.test(storedName)) {
        missing += 1;
        nextAttachments.push(attachment);
        continue;
      }

      const sourcePath = await firstExistingFile(
        legacyDirectories.map((directory) => join(directory, storedName)),
      );

      if (!sourcePath) {
        missing += 1;
        nextAttachments.push(attachment);
        continue;
      }

      const contents = await readFile(sourcePath);
      if (contents.length > MAX_ATTACHMENT_SIZE) {
        oversized += 1;
        nextAttachments.push(attachment);
        continue;
      }

      const id = readyMatch?.[1] ?? randomUUID();
      const storageKey = `novamail/email-attachments/${id}`;
      const canonical = {
        filename: sanitizeFilename(attachment?.filename || storedName),
        url: `/api/emails/attachments/${id}`,
        size: contents.length,
        mimeType: sanitizeMimeType(attachment?.mimeType),
      };
      const checksum = createHash("sha256").update(contents).digest("hex");

      unwrap(
        await storage.uploadFromBytes(storageKey, contents),
        `Uploading legacy attachment ${storedName}`,
      );

      try {
        await db.query("BEGIN");
        await db.query(
          `INSERT INTO email_attachment_objects
             (id, owner_user_id, storage_key, filename, mime_type, size, checksum_sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             storage_key = EXCLUDED.storage_key,
             filename = EXCLUDED.filename,
             mime_type = EXCLUDED.mime_type,
             size = EXCLUDED.size,
             checksum_sha256 = EXCLUDED.checksum_sha256`,
          [
            id,
            email.user_id,
            storageKey,
            canonical.filename,
            canonical.mimeType,
            canonical.size,
            checksum,
          ],
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        await storage.delete(storageKey).catch(() => undefined);
        throw error;
      }

      existingIds.add(id);
      migratedByLegacyUrl.set(pathname, canonical);
      nextAttachments.push(canonical);
      changed = true;
      migrated += 1;
    }

    if (changed) {
      await db.query(`UPDATE emails SET attachments = $1::jsonb WHERE id = $2`, [
        JSON.stringify(nextAttachments),
        email.id,
      ]);
    }
  }

  // Remove metadata and objects for uploads that were abandoned more than one day ago.
  const { rows: staleObjects } = await db.query(`
    SELECT object.id, object.storage_key
    FROM email_attachment_objects AS object
    WHERE object.created_at < now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1
        FROM emails,
             jsonb_array_elements(COALESCE(emails.attachments, '[]'::jsonb)) AS attachment
        WHERE attachment->>'url' = '/api/emails/attachments/' || object.id
      )
  `);

  let staleObjectsRemoved = 0;
  for (const object of staleObjects) {
    const result = await storage.delete(object.storage_key);
    if (!result.ok && !/not[ -]?found|404|does not exist/i.test(String(result.error))) {
      console.warn(`Could not delete stale object ${object.id}:`, result.error);
      continue;
    }
    await db.query(`DELETE FROM email_attachment_objects WHERE id = $1`, [object.id]);
    staleObjectsRemoved += 1;
  }

  console.log(
    JSON.stringify(
      {
        migrated,
        alreadyReady,
        attachmentMetadataBackupRows,
        missingLegacyFiles: missing,
        oversizedLegacyFiles: oversized,
        staleObjectsRemoved,
      },
      null,
      2,
    ),
  );

  if (missing > 0) {
    console.warn(
      "Some old attachment binaries were already missing from the Replit filesystem. Their metadata was preserved, but those specific old files cannot be reconstructed without the originals.",
    );
  }
} finally {
  db.release();
  await pool.end();
}
