import { and, desc, eq, gte, lte } from "drizzle-orm";
import { meetingSuggestion } from "./meeting-parser.js";
import {
  calendarEventsTable,
  db,
  emailTemplatesTable,
  emailsTable,
  tasksTable,
  type CalendarEvent,
  type EmailTemplate,
  type Task,
} from "@workspace/db";

function owned<T extends { userId: string }>(row: T | undefined, userId: string, message: string): T {
  if (!row || row.userId !== userId) throw Object.assign(new Error(message), { statusCode: 404 });
  return row;
}

export async function listTemplates(userId: string): Promise<EmailTemplate[]> {
  return db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.userId, userId)).orderBy(desc(emailTemplatesTable.updatedAt));
}

export async function createTemplate(userId: string, input: { name: string; subject?: string; bodyHtml?: string; bodyText?: string }): Promise<EmailTemplate> {
  const name = String(input.name ?? "").trim();
  if (!name) throw Object.assign(new Error("Template name is required"), { statusCode: 400 });
  const [template] = await db.insert(emailTemplatesTable).values({
    userId,
    name,
    subject: String(input.subject ?? ""),
    bodyHtml: String(input.bodyHtml ?? ""),
    bodyText: String(input.bodyText ?? ""),
  }).returning();
  return template;
}

export async function updateTemplate(userId: string, id: string, input: Partial<{ name: string; subject: string; bodyHtml: string; bodyText: string }>): Promise<EmailTemplate> {
  const [template] = await db.update(emailTemplatesTable).set({
    ...(input.name !== undefined ? { name: String(input.name).trim() } : {}),
    ...(input.subject !== undefined ? { subject: String(input.subject) } : {}),
    ...(input.bodyHtml !== undefined ? { bodyHtml: String(input.bodyHtml) } : {}),
    ...(input.bodyText !== undefined ? { bodyText: String(input.bodyText) } : {}),
    updatedAt: new Date(),
  }).where(and(eq(emailTemplatesTable.id, id), eq(emailTemplatesTable.userId, userId))).returning();
  return owned(template, userId, "Template not found");
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  const deleted = await db.delete(emailTemplatesTable).where(and(eq(emailTemplatesTable.id, id), eq(emailTemplatesTable.userId, userId))).returning({ id: emailTemplatesTable.id });
  if (!deleted.length) throw Object.assign(new Error("Template not found"), { statusCode: 404 });
}

export async function listTasks(userId: string): Promise<Task[]> {
  return db.select().from(tasksTable).where(eq(tasksTable.userId, userId)).orderBy(desc(tasksTable.createdAt));
}

export async function createTask(userId: string, input: { title: string; notes?: string; emailId?: string | null; dueAt?: string | null; priority?: "low" | "normal" | "high" }): Promise<Task> {
  const title = String(input.title ?? "").trim();
  if (!title) throw Object.assign(new Error("Task title is required"), { statusCode: 400 });
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw Object.assign(new Error("Invalid task due date"), { statusCode: 400 });
  const [task] = await db.insert(tasksTable).values({ userId, title, notes: String(input.notes ?? ""), emailId: input.emailId ?? null, dueAt, priority: input.priority ?? "normal" }).returning();
  return task;
}

export async function updateTask(userId: string, id: string, input: Partial<{ title: string; notes: string; dueAt: string | null; status: "open" | "completed"; priority: "low" | "normal" | "high" }>): Promise<Task> {
  const nextStatus = input.status;
  const [task] = await db.update(tasksTable).set({
    ...(input.title !== undefined ? { title: String(input.title).trim() } : {}),
    ...(input.notes !== undefined ? { notes: String(input.notes) } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
    ...(nextStatus !== undefined ? { status: nextStatus, completedAt: nextStatus === "completed" ? new Date() : null } : {}),
    updatedAt: new Date(),
  }).where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId))).returning();
  return owned(task, userId, "Task not found");
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const deleted = await db.delete(tasksTable).where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId))).returning({ id: tasksTable.id });
  if (!deleted.length) throw Object.assign(new Error("Task not found"), { statusCode: 404 });
}

export async function suggestCalendarEvent(userId: string, emailId: string) {
  const [email] = await db.select({ subject: emailsTable.subject, bodyText: emailsTable.bodyText, fromEmail: emailsTable.fromEmail }).from(emailsTable).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId))).limit(1);
  if (!email) throw Object.assign(new Error("Email not found"), { statusCode: 404 });
  return meetingSuggestion(email);
}

export async function createCalendarEvent(userId: string, input: { emailId?: string | null; title: string; description?: string; location?: string | null; startsAt: string; endsAt: string; attendees?: string[] }): Promise<CalendarEvent> {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw Object.assign(new Error("Invalid calendar event time range"), { statusCode: 400 });
  const [event] = await db.insert(calendarEventsTable).values({ userId, emailId: input.emailId ?? null, title: String(input.title ?? "Meeting").trim(), description: String(input.description ?? ""), location: input.location ?? null, startsAt, endsAt, attendees: input.attendees ?? [] }).returning();
  return event;
}

export async function listCalendarEvents(userId: string, from?: string, to?: string): Promise<CalendarEvent[]> {
  const conditions = [eq(calendarEventsTable.userId, userId)];
  if (from) conditions.push(gte(calendarEventsTable.startsAt, new Date(from)));
  if (to) conditions.push(lte(calendarEventsTable.startsAt, new Date(to)));
  return db.select().from(calendarEventsTable).where(and(...conditions)).orderBy(calendarEventsTable.startsAt);
}

export async function deleteCalendarEvent(userId: string, id: string): Promise<void> {
  const deleted = await db.delete(calendarEventsTable).where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId))).returning({ id: calendarEventsTable.id });
  if (!deleted.length) throw Object.assign(new Error("Calendar event not found"), { statusCode: 404 });
}

export async function getAnalytics(userId: string) {
  const rows = await db.select({ createdAt: emailsTable.createdAt, isRead: emailsTable.isRead, attachments: emailsTable.attachments, bodyText: emailsTable.bodyText }).from(emailsTable).where(eq(emailsTable.userId, userId));
  const activityByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  let storageBytes = 0;
  let unread = 0;
  for (const row of rows) {
    activityByHour[row.createdAt.getHours()]!.count += 1;
    if (!row.isRead) unread += 1;
    for (const attachment of (row.attachments as Array<{ size?: number }> | null) ?? []) storageBytes += Number(attachment.size ?? 0);
  }
  const peakHour = activityByHour.reduce((peak, item) => item.count > peak.count ? item : peak, activityByHour[0]!);
  return { totalEmails: rows.length, unreadEmails: unread, storageBytes, peakHour: peakHour.hour, activityByHour };
}
