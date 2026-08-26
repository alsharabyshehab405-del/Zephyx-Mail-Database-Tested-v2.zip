import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  emailAttachmentObjectsTable,
  emailsTable,
  type EmailAttachment,
  type EmailAttachmentObject,
} from "@workspace/db";
import {
  attachmentStorageKey,
  deleteAttachmentObject,
  readAttachmentObject,
  writeAttachmentObject,
} from "../../lib/attachment-storage.js";
import type { OutboundAttachment } from "../../lib/mailer.js";
import { logger } from "../../lib/logger.js";
import {
  assertAttachmentCount,
  assertSafeAttachment,
  attachmentScannerName,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_V3,
  MAX_TOTAL_ATTACHMENT_SIZE_V3,
  sanitizeSecureFilename,
  scanAttachment,
} from "../../lib/attachment-security.js";

export const MAX_ATTACHMENT_SIZE = MAX_ATTACHMENT_SIZE_V3;
export const MAX_TOTAL_ATTACHMENT_SIZE = MAX_TOTAL_ATTACHMENT_SIZE_V3;
export { MAX_ATTACHMENT_COUNT };

const ATTACHMENT_URL_PREFIX = "/api/emails/attachments/";
const ATTACHMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let lastOrphanCleanupAt = 0;

function attachmentError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode });
}

export function sanitizeAttachmentFilename(value: string | undefined): string {
  return sanitizeSecureFilename(value);
}

export function sanitizeAttachmentMimeType(value: string | undefined): string {
  const normalized = (value ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  return normalized && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)
    ? normalized
    : "application/octet-stream";
}

export function attachmentUrl(attachmentId: string): string {
  return `${ATTACHMENT_URL_PREFIX}${attachmentId}`;
}

export function attachmentIdFromUrl(url: string): string | null {
  let pathname: string;

  try {
    pathname = new URL(url, "http://novamail.local").pathname;
  } catch {
    return null;
  }

  if (!pathname.startsWith(ATTACHMENT_URL_PREFIX)) return null;

  const id = pathname.slice(ATTACHMENT_URL_PREFIX.length);
  return ATTACHMENT_ID_PATTERN.test(id) ? id : null;
}

function toEmailAttachment(record: EmailAttachmentObject): EmailAttachment {
  return {
    filename: record.filename,
    url: attachmentUrl(record.id),
    organizationId: record.organizationId,
    size: record.size,
    mimeType: record.mimeType,
    scanStatus: record.scanStatus as EmailAttachment["scanStatus"],
  };
}

async function findAttachmentObject(attachmentId: string) {
  const [record] = await db
    .select()
    .from(emailAttachmentObjectsTable)
    .where(eq(emailAttachmentObjectsTable.id, attachmentId))
    .limit(1);

  return record ?? null;
}

async function userReferencesAttachment(userId: string, url: string): Promise<boolean> {
  const [reference] = await db
    .select({ id: emailsTable.id })
    .from(emailsTable)
    .where(
      and(
        eq(emailsTable.userId, userId),
        sql`EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(${emailsTable.attachments}, '[]'::jsonb)) AS attachment
          WHERE attachment->>'url' = ${url}
        )`,
      ),
    )
    .limit(1);

  return Boolean(reference);
}

async function anyEmailReferencesAttachment(url: string): Promise<boolean> {
  const [reference] = await db
    .select({ id: emailsTable.id })
    .from(emailsTable)
    .where(
      sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(${emailsTable.attachments}, '[]'::jsonb)) AS attachment
        WHERE attachment->>'url' = ${url}
      )`,
    )
    .limit(1);

  return Boolean(reference);
}

async function assertUserCanAccessAttachment(
  userId: string,
  record: EmailAttachmentObject,
  organizationId = "personal",
): Promise<void> {
  if (record.organizationId !== organizationId) {
    throw attachmentError("Attachment not found", 404);
  }

  if (record.ownerUserId === userId) return;

  if (await userReferencesAttachment(userId, attachmentUrl(record.id))) return;

  throw attachmentError("Attachment not found", 404);
}

async function cleanupStaleOrphanedAttachments(): Promise<void> {
  const now = Date.now();
  if (now - lastOrphanCleanupAt < 60 * 60 * 1000) return;
  lastOrphanCleanupAt = now;

  const staleRecords = await db
    .select()
    .from(emailAttachmentObjectsTable)
    .where(sql`${emailAttachmentObjectsTable.createdAt} < now() - interval '24 hours'`)
    .limit(50);

  for (const record of staleRecords) {
    if (await anyEmailReferencesAttachment(attachmentUrl(record.id))) continue;

    try {
      await deleteAttachmentObject(record.storageKey);
      await db
        .delete(emailAttachmentObjectsTable)
        .where(eq(emailAttachmentObjectsTable.id, record.id));
    } catch (error) {
      logger.warn(
        { err: error, attachmentId: record.id },
        "Could not remove a stale orphan attachment object",
      );
    }
  }
}

function scheduleOrphanCleanup(): void {
  void cleanupStaleOrphanedAttachments().catch((error) => {
    logger.warn({ err: error }, "Background attachment orphan cleanup failed");
  });
}

export async function createPersistentAttachment(options: {
  ownerUserId: string;
  organizationId?: string;
  filename: string;
  mimeType?: string;
  contents: Buffer;
}): Promise<EmailAttachment> {
  const size = options.contents.length;

  if (size === 0) {
    throw attachmentError("Attachment file is required", 400);
  }

  if (size > MAX_ATTACHMENT_SIZE) {
    throw attachmentError("Attachment exceeds the 25 MB limit", 413);
  }

  const detectedMimeType = assertSafeAttachment(options.contents, options.mimeType, options.filename);
  const scanStatus = await scanAttachment(options.contents, options.filename);
  const scannedAt = new Date();

  const id = randomUUID();
  const storageKey = attachmentStorageKey(
    id,
    options.ownerUserId,
    options.organizationId ?? "personal",
  );
  const filename = sanitizeAttachmentFilename(options.filename);
  const mimeType = detectedMimeType;
  const checksumSha256 = createHash("sha256").update(options.contents).digest("hex");

  await writeAttachmentObject(storageKey, options.contents);

  try {
    const [record] = await db
      .insert(emailAttachmentObjectsTable)
      .values({
        id,
        ownerUserId: options.ownerUserId,
        organizationId: options.organizationId ?? "personal",
        storageKey,
        filename,
        mimeType,
        size,
        checksumSha256,
        scanStatus,
        scanEngine: attachmentScannerName(),
        scannedAt,
      })
      .returning();

    if (!record) {
      throw attachmentError("Attachment metadata could not be created", 500);
    }

    scheduleOrphanCleanup();
    return toEmailAttachment(record);
  } catch (error) {
    await deleteAttachmentObject(storageKey).catch((cleanupError) => {
      logger.warn(
        { err: cleanupError, attachmentId: id },
        "Could not roll back an attachment object after metadata failure",
      );
    });
    throw error;
  }
}

export async function normalizeAttachmentsForUser(
  userId: string,
  attachments: EmailAttachment[] | undefined,
  organizationId = "personal",
): Promise<EmailAttachment[]> {
  const normalized: EmailAttachment[] = [];
  const seen = new Set<string>();
  assertAttachmentCount(attachments?.length ?? 0);
  let totalSize = 0;

  for (const candidate of attachments ?? []) {
    const attachmentId = attachmentIdFromUrl(candidate.url);

    if (!attachmentId) {
      throw attachmentError(
        "A legacy attachment is unavailable. Remove it and attach the original file again.",
        410,
      );
    }

    if (seen.has(attachmentId)) continue;

    const record = await findAttachmentObject(attachmentId);

    if (!record) {
      throw attachmentError("Attachment data was not found", 404);
    }

    await assertUserCanAccessAttachment(userId, record, candidate.organizationId ?? organizationId);
    if (record.scanStatus !== "clean") {
      throw attachmentError("Attachment is unavailable until malware scanning returns a clean verdict", 422);
    }

    totalSize += record.size;
    if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
      throw attachmentError("Total attachment size exceeds the 50 MB limit", 413);
    }

    seen.add(attachmentId);
    normalized.push(toEmailAttachment(record));
  }

  return normalized;
}

export async function getAttachmentForUser(
  userId: string,
  attachmentId: string,
  organizationId = "personal",
): Promise<{ record: EmailAttachmentObject; contents: Buffer }> {
  if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) {
    throw attachmentError(
      "This legacy attachment is no longer available. Attach the original file again.",
      410,
    );
  }

  const record = await findAttachmentObject(attachmentId);

  if (!record) {
    throw attachmentError("Attachment not found", 404);
  }

  await assertUserCanAccessAttachment(userId, record, organizationId);
  if (record.scanStatus !== "clean") {
    throw attachmentError("Attachment is unavailable until malware scanning returns a clean verdict", 422);
  }
  const contents = await readAttachmentObject(record.storageKey);

  if (contents.length !== record.size) {
    logger.warn(
      {
        attachmentId: record.id,
        expectedSize: record.size,
        actualSize: contents.length,
      },
      "Attachment size differs from stored metadata",
    );
  }

  return { record, contents };
}

export async function toOutboundAttachments(
  userId: string,
  attachments: EmailAttachment[] | undefined,
  organizationId = "personal",
): Promise<{ canonical: EmailAttachment[]; outbound: OutboundAttachment[] }> {
  const canonical = await normalizeAttachmentsForUser(userId, attachments, organizationId);
  const outbound: OutboundAttachment[] = [];

  for (const attachment of canonical) {
    const attachmentId = attachmentIdFromUrl(attachment.url);

    if (!attachmentId) {
      throw attachmentError("Invalid attachment URL", 400);
    }

    const record = await findAttachmentObject(attachmentId);

    if (!record) {
      throw attachmentError("Attachment data was not found", 404);
    }

    outbound.push({
      filename: record.filename,
      content: await readAttachmentObject(record.storageKey),
      contentType: record.mimeType,
    });
  }

  return { canonical, outbound };
}

export async function cleanupAttachmentCandidates(
  attachments: EmailAttachment[] | null | undefined,
): Promise<void> {
  const ids = new Set(
    (attachments ?? [])
      .map((attachment) => attachmentIdFromUrl(attachment.url))
      .filter((id): id is string => Boolean(id)),
  );

  for (const id of ids) {
    const record = await findAttachmentObject(id);
    if (!record) continue;

    if (await anyEmailReferencesAttachment(attachmentUrl(id))) continue;

    try {
      await deleteAttachmentObject(record.storageKey);
      await db
        .delete(emailAttachmentObjectsTable)
        .where(eq(emailAttachmentObjectsTable.id, id));
    } catch (error) {
      logger.error(
        { err: error, attachmentId: id },
        "An unreferenced attachment could not be removed",
      );
    }
  }
}

export async function deleteOwnedUnreferencedAttachment(
  userId: string,
  attachmentId: string,
  organizationId = "personal",
): Promise<void> {
  const record = await findAttachmentObject(attachmentId);

  if (!record || record.ownerUserId !== userId || record.organizationId !== organizationId) {
    throw attachmentError("Attachment not found", 404);
  }

  if (await anyEmailReferencesAttachment(attachmentUrl(attachmentId))) {
    throw attachmentError("Attachment is already used by an email", 409);
  }

  await deleteAttachmentObject(record.storageKey);
  await db
    .delete(emailAttachmentObjectsTable)
    .where(eq(emailAttachmentObjectsTable.id, attachmentId));
}

export function removedAttachments(
  previous: EmailAttachment[] | null | undefined,
  next: EmailAttachment[] | null | undefined,
): EmailAttachment[] {
  const nextUrls = new Set((next ?? []).map((attachment) => attachment.url));
  return (previous ?? []).filter((attachment) => !nextUrls.has(attachment.url));
}
