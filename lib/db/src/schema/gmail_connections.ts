import {
  pgTable,
  text,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const gmailConnectionsTable = pgTable("gmail_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, {
      onDelete: "cascade",
    }),

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
});

export type GmailConnection =
  typeof gmailConnectionsTable.$inferSelect;

export type InsertGmailConnection =
  typeof gmailConnectionsTable.$inferInsert;
