import { index, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { emailsTable } from "./emails";

export type SecurityFeedbackType = "spam" | "not_spam" | "phishing" | "not_phishing";

export const emailSecurityFeedbackTable = pgTable(
  "email_security_feedback",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull().default("personal"),
    feedbackType: varchar("feedback_type", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_security_feedback_email_org_user_unique").on(table.emailId, table.organizationId, table.userId),
    index("email_security_feedback_org_type_idx").on(table.organizationId, table.feedbackType, table.createdAt),
    index("email_security_feedback_user_type_idx").on(table.userId, table.feedbackType, table.createdAt),
  ],
);

export type EmailSecurityFeedback = typeof emailSecurityFeedbackTable.$inferSelect;
export type InsertEmailSecurityFeedback = typeof emailSecurityFeedbackTable.$inferInsert;
