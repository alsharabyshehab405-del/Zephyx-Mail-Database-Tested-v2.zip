import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { emailsTable } from "./emails";

export const dispatchStatusEnum = pgEnum("dispatch_status", ["pending", "publishing", "processing", "completed", "failed", "dead_letter", "delivery_unknown"]);

export const emailDispatchOutboxTable = pgTable(
  "email_dispatch_outbox",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
    jobKey: text("job_key").notNull(),
    queueName: text("queue_name").notNull(),
    status: dispatchStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    correlationId: text("correlation_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_dispatch_outbox_job_key_unique").on(table.jobKey),
    index("email_dispatch_outbox_due_idx").on(table.status, table.availableAt),
    index("email_dispatch_outbox_lease_idx").on(table.status, table.leaseExpiresAt),
    index("email_dispatch_outbox_email_idx").on(table.emailId),
  ],
);

export type EmailDispatchOutbox = typeof emailDispatchOutboxTable.$inferSelect;
export type NewEmailDispatchOutbox = typeof emailDispatchOutboxTable.$inferInsert;
