import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Persistent metadata for objects stored in S3-compatible staging storage.
 *
 * The message keeps only a stable API URL in its JSON attachments array. The
 * binary itself lives in App Storage, while this table provides ownership,
 * authorization, canonical metadata, cleanup, and migration support.
 */
export const emailAttachmentObjectsTable = pgTable(
  "email_attachment_objects",
  {
    id: text("id").primaryKey(),

    ownerUserId: text("owner_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    organizationId: text("organization_id").notNull().default("personal"),

    storageKey: text("storage_key").notNull(),

    filename: varchar("filename", {
      length: 998,
    }).notNull(),

    mimeType: varchar("mime_type", {
      length: 255,
    })
      .notNull()
      .default("application/octet-stream"),

    size: integer("size").notNull(),

    checksumSha256: varchar("checksum_sha256", {
      length: 64,
    }).notNull(),

    // Legacy objects are untrusted until they complete a real malware scan.
    scanStatus: varchar("scan_status", { length: 20 }).notNull().default("not_scanned"),

    scanEngine: varchar("scan_engine", { length: 80 }),

    scannedAt: timestamp("scanned_at", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_attachment_objects_storage_key_unique").on(table.storageKey),
    index("email_attachment_objects_owner_idx").on(table.ownerUserId),
    index("email_attachment_objects_org_owner_idx").on(table.organizationId, table.ownerUserId),
    index("email_attachment_objects_created_idx").on(table.createdAt),
  ],
);

export type EmailAttachmentObject = typeof emailAttachmentObjectsTable.$inferSelect;
export type InsertEmailAttachmentObject = typeof emailAttachmentObjectsTable.$inferInsert;
