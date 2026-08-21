import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import { db, emailAttachmentObjectsTable } from "@workspace/db";
import { readAttachmentObject } from "../src/lib/attachment-storage.js";

const attachments = await db
  .select({
    id: emailAttachmentObjectsTable.id,
    filename: emailAttachmentObjectsTable.filename,
    mimeType: emailAttachmentObjectsTable.mimeType,
    expectedSize: emailAttachmentObjectsTable.size,
    expectedChecksum: emailAttachmentObjectsTable.checksumSha256,
    storageKey: emailAttachmentObjectsTable.storageKey,
    createdAt: emailAttachmentObjectsTable.createdAt,
  })
  .from(emailAttachmentObjectsTable)
  .orderBy(desc(emailAttachmentObjectsTable.createdAt))
  .limit(5);

console.log("LATEST_ATTACHMENTS:", attachments.length);

for (const attachment of attachments) {
  try {
    const contents = await readAttachmentObject(attachment.storageKey);
    const actualChecksum = createHash("sha256")
      .update(contents)
      .digest("hex");

    console.log({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      expectedSize: attachment.expectedSize,
      actualSize: contents.length,
      sizeMatches: contents.length === attachment.expectedSize,
      checksumMatches:
        !attachment.expectedChecksum ||
        actualChecksum === attachment.expectedChecksum,
      firstBytesHex: contents.subarray(0, 16).toString("hex"),
      createdAt: attachment.createdAt,
    });
  } catch (error) {
    console.error({
      id: attachment.id,
      filename: attachment.filename,
      readError: error instanceof Error ? error.message : String(error),
    });
  }
}
