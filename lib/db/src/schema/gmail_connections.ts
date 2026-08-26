import {
  pgTable,
  text,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const gmailConnectionsTable = pgTable("gmail_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, {
      onDelete: "cascade",
    }),

  provider: varchar("provider", { length: 30 }).notNull().default("gmail"),
  externalAccountId: text("external_account_id").notNull(),
  emailAddress: varchar("email_address", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  scopes: text("scopes"),
  syncStatus: varchar("sync_status", { length: 30 }).notNull().default("connected"),
  // Kept as a compatibility alias for existing Gmail code and legacy rows.
  gmailEmail: varchar("gmail_email", {
    length: 255,
  }).notNull(),

  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),

  tokenExpiry: timestamp("token_expiry", {
    withTimezone: true,
  }),

  scope: text("scope"),
  tokenType: varchar("token_type", {
    length: 50,
  }),

  lastHistoryId: text("last_history_id"),

  lastSyncedAt: timestamp("last_synced_at", {
    withTimezone: true,
  }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("gmail_connections_provider_external_unique").on(table.provider, table.externalAccountId),
  index("gmail_connections_user_idx").on(table.userId),
]);

export type GmailConnection =
  typeof gmailConnectionsTable.$inferSelect;

export type InsertGmailConnection =
  typeof gmailConnectionsTable.$inferInsert;
