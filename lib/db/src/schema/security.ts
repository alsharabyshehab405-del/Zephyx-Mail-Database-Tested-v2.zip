import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    success: text("success").notNull().default("true"),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_logs_user_created_idx").on(table.userId, table.createdAt), index("audit_logs_action_created_idx").on(table.action, table.createdAt)],
);

export const idempotencyKeysTable = pgTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    emailId: text("email_id"),
    status: text("status").notNull().default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("idempotency_keys_user_key_unique").on(table.userId, table.key), index("idempotency_keys_expiry_idx").on(table.expiresAt)],
);

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeysTable.$inferSelect;
