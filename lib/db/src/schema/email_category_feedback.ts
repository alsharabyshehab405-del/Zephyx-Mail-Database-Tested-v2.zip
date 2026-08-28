import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { emailsTable, emailCategoryEnum, type EmailCategory } from "./emails";
import { usersTable } from "./users";

export const emailCategoryFeedbackTable = pgTable(
  "email_category_feedback",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull().default("personal"),
    category: emailCategoryEnum("category").notNull(),
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_category_feedback_email_org_user_unique").on(table.emailId, table.organizationId, table.userId),
    index("email_category_feedback_org_category_idx").on(table.organizationId, table.category, table.updatedAt),
    index("email_category_feedback_user_category_idx").on(table.userId, table.category, table.updatedAt),
  ],
);

export type EmailCategoryFeedback = typeof emailCategoryFeedbackTable.$inferSelect;
export type InsertEmailCategoryFeedback = typeof emailCategoryFeedbackTable.$inferInsert;
export type { EmailCategory };
