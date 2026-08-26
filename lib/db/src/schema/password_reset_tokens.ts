import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("password_reset_tokens_user_used_idx").on(table.userId, table.usedAt),
    index("password_reset_tokens_expires_idx").on(table.expiresAt),
  ],
);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokensTable.$inferInsert;
