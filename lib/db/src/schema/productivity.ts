import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { emailsTable } from "./emails";

export const taskStatusEnum = pgEnum("task_status", ["open", "completed"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "normal", "high"]);
export const followUpStatusEnum = pgEnum("follow_up_status", ["open", "snoozed", "completed", "dismissed"]);

export const emailTemplatesTable = pgTable("email_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull().default(""),
  bodyHtml: text("body_html").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("email_templates_user_name_unique").on(table.userId, table.name),
  index("email_templates_user_idx").on(table.userId, table.updatedAt),
]);

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  emailId: text("email_id").references(() => emailsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: taskStatusEnum("status").notNull().default("open"),
  priority: taskPriorityEnum("priority").notNull().default("normal"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("tasks_user_status_due_idx").on(table.userId, table.status, table.dueAt),
]);

export const emailFollowUpsTable = pgTable("email_follow_ups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  status: followUpStatusEnum("status").notNull().default("open"),
  note: text("note").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("email_follow_ups_user_status_remind_idx").on(table.userId, table.status, table.remindAt),
  index("email_follow_ups_email_idx").on(table.emailId),
]);

export const calendarEventsTable = pgTable("calendar_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  emailId: text("email_id").references(() => emailsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  location: text("location"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  attendees: jsonb("attendees").$type<string[]>().notNull().default([]),
  provider: text("provider").notNull().default("local"),
  externalId: text("external_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("calendar_events_user_start_idx").on(table.userId, table.startsAt),
  uniqueIndex("calendar_events_user_external_unique").on(table.userId, table.externalId),
]);

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
export type Task = typeof tasksTable.$inferSelect;
export type EmailFollowUp = typeof emailFollowUpsTable.$inferSelect;
export type CalendarEvent = typeof calendarEventsTable.$inferSelect;
