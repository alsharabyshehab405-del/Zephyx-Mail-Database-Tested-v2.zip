import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { foldersTable } from "./folders";
import { gmailConnectionsTable } from "./gmail_connections";

export const emailFolderEnum = pgEnum("email_folder", [
  "inbox",
  "sent",
  "drafts",
  "starred",
  "archive",
  "trash",
  "spam",
]);

export const emailCategoryEnum = pgEnum("email_category", [
  "primary",
  "promotional",
  "updates",
  "social",
]);

export const emailStatusEnum = pgEnum("email_status", [
  "draft",
  "pending_send",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "failed",
]);

export type EmailAddress = {
  email: string;
  name?: string | null;
};

export type EmailAttachment = {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  scanStatus?: "clean" | "infected" | "unavailable" | "not_scanned";
};

export const emailsTable = pgTable("emails", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
    }),

  accountId: text("account_id").references(() => gmailConnectionsTable.id, {
    onDelete: "set null",
  }),

  subject: varchar("subject", {
    length: 998,
  })
    .notNull()
    .default(""),

  fromEmail: varchar("from_email", {
    length: 255,
  }).notNull(),

  fromName: varchar("from_name", {
    length: 255,
  }),

  toAddresses: jsonb("to_addresses").notNull().$type<EmailAddress[]>().default([]),

  ccAddresses: jsonb("cc_addresses").$type<EmailAddress[]>().default([]),

  bccAddresses: jsonb("bcc_addresses").$type<EmailAddress[]>().default([]),

  bodyHtml: text("body_html").notNull().default(""),

  bodyText: text("body_text").notNull().default(""),

  folder: emailFolderEnum("folder").notNull().default("inbox"),

  customFolderId: text("custom_folder_id").references(() => foldersTable.id, {
    onDelete: "set null",
  }),

  isRead: boolean("is_read").notNull().default(false),

  isStarred: boolean("is_starred").notNull().default(false),

  isDraft: boolean("is_draft").notNull().default(false),

  attachments: jsonb("attachments").$type<EmailAttachment[]>().default([]),

  threadId: text("thread_id"),

  replyToId: text("reply_to_id"),
  messageId: text("message_id"),
  inReplyTo: text("in_reply_to"),
  references: jsonb("references").$type<string[]>().default([]),

  labels: jsonb("labels").$type<string[]>().default([]),
  category: emailCategoryEnum("category").notNull().default("primary"),
  aiSummary: text("ai_summary"),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  status: emailStatusEnum("status").notNull().default("sent"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sendError: text("send_error"),

  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  gmailHistoryId: text("gmail_history_id"),

  sentAt: timestamp("sent_at", {
    withTimezone: true,
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("emails_user_gmail_message_unique").on(
    table.userId,
    table.gmailMessageId,
  ),
  index("emails_user_gmail_thread_idx").on(
    table.userId,
    table.gmailThreadId,
  ),
  index("emails_pending_send_idx").on(table.status, table.scheduledAt),
  index("emails_user_account_created_idx").on(table.userId, table.accountId, table.createdAt),
  index("emails_user_folder_created_id_idx").on(table.userId, table.folder, table.createdAt, table.id),
  index("emails_user_unread_created_id_idx").on(table.userId, table.isRead, table.createdAt, table.id),
  index("emails_user_custom_folder_created_id_idx").on(table.userId, table.customFolderId, table.createdAt, table.id),
  index("emails_user_labels_gin_idx").using("gin", table.labels),
]);

export type Email = typeof emailsTable.$inferSelect;
export type InsertEmail = typeof emailsTable.$inferInsert;
