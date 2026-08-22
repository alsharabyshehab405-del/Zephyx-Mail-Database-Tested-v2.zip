import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { meetingSuggestion } from "./meeting-parser.js";
import {
  calendarEventsTable,
  db,
  emailFollowUpsTable,
  emailTemplatesTable,
  emailsTable,
  type CalendarEvent,
  type EmailFollowUp,
  type EmailTemplate,
  type Task,
  tasksTable,
} from "@workspace/db";

function owned<T extends { userId: string }>(row: T | undefined, userId: string, message: string): T {
  if (!row || row.userId !== userId) throw Object.assign(new Error(message), { statusCode: 404 });
  return row;
}

async function ownedEmail(userId: string, emailId: string) {
  const [email] = await db.select().from(emailsTable).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId))).limit(1);
  if (!email) throw Object.assign(new Error("Email not found"), { statusCode: 404 });
  return email;
}

export async function listTemplates(userId: string): Promise<EmailTemplate[]> {
  return db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.userId, userId)).orderBy(desc(emailTemplatesTable.updatedAt));
}

export async function createTemplate(userId: string, input: { name: string; subject?: string; bodyHtml?: string; bodyText?: string }): Promise<EmailTemplate> {
  const name = String(input.name ?? "").trim();
  if (!name) throw Object.assign(new Error("Template name is required"), { statusCode: 400 });
  const [template] = await db.insert(emailTemplatesTable).values({ userId, name, subject: String(input.subject ?? ""), bodyHtml: String(input.bodyHtml ?? ""), bodyText: String(input.bodyText ?? "") }).returning();
  return template;
}

export async function updateTemplate(userId: string, id: string, input: Partial<{ name: string; subject: string; bodyHtml: string; bodyText: string }>): Promise<EmailTemplate> {
  const [template] = await db.update(emailTemplatesTable).set({ ...(input.name !== undefined ? { name: String(input.name).trim() } : {}), ...(input.subject !== undefined ? { subject: String(input.subject) } : {}), ...(input.bodyHtml !== undefined ? { bodyHtml: String(input.bodyHtml) } : {}), ...(input.bodyText !== undefined ? { bodyText: String(input.bodyText) } : {}), updatedAt: new Date() }).where(and(eq(emailTemplatesTable.id, id), eq(emailTemplatesTable.userId, userId))).returning();
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
  if (input.emailId) await ownedEmail(userId, input.emailId);
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw Object.assign(new Error("Invalid task due date"), { statusCode: 400 });
  const [task] = await db.insert(tasksTable).values({ userId, title, notes: String(input.notes ?? ""), emailId: input.emailId ?? null, dueAt, priority: input.priority ?? "normal" }).returning();
  return task;
}

export async function updateTask(userId: string, id: string, input: Partial<{ title: string; notes: string; dueAt: string | null; status: "open" | "completed"; priority: "low" | "normal" | "high" }>): Promise<Task> {
  const nextDueAt = input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null;
  if (nextDueAt instanceof Date && Number.isNaN(nextDueAt.getTime())) throw Object.assign(new Error("Invalid task due date"), { statusCode: 400 });
  const nextStatus = input.status;
  const [task] = await db.update(tasksTable).set({ ...(input.title !== undefined ? { title: String(input.title).trim() } : {}), ...(input.notes !== undefined ? { notes: String(input.notes) } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}), ...(input.dueAt !== undefined ? { dueAt: nextDueAt } : {}), ...(nextStatus !== undefined ? { status: nextStatus, completedAt: nextStatus === "completed" ? new Date() : null } : {}), updatedAt: new Date() }).where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId))).returning();
  return owned(task, userId, "Task not found");
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const deleted = await db.delete(tasksTable).where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId))).returning({ id: tasksTable.id });
  if (!deleted.length) throw Object.assign(new Error("Task not found"), { statusCode: 404 });
}

export async function suggestCalendarEvent(userId: string, emailId: string) {
  const email = await ownedEmail(userId, emailId);
  return meetingSuggestion({ subject: email.subject, bodyText: email.bodyText, fromEmail: email.fromEmail });
}

export async function createCalendarEvent(userId: string, input: { emailId?: string | null; title: string; description?: string; location?: string | null; startsAt: string; endsAt: string; attendees?: string[] }): Promise<CalendarEvent> {
  if (input.emailId) await ownedEmail(userId, input.emailId);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw Object.assign(new Error("Invalid calendar event time range"), { statusCode: 400 });
  const [event] = await db.insert(calendarEventsTable).values({ userId, emailId: input.emailId ?? null, title: String(input.title ?? "Meeting").trim() || "Meeting", description: String(input.description ?? ""), location: input.location ?? null, startsAt, endsAt, attendees: input.attendees ?? [] }).returning();
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

export type FollowUpInput = { emailId: string; remindAt: string; note?: string };

export async function listFollowUps(userId: string) {
  return db.select({ id: emailFollowUpsTable.id, emailId: emailFollowUpsTable.emailId, remindAt: emailFollowUpsTable.remindAt, status: emailFollowUpsTable.status, note: emailFollowUpsTable.note, completedAt: emailFollowUpsTable.completedAt, createdAt: emailFollowUpsTable.createdAt, emailSubject: emailsTable.subject, fromEmail: emailsTable.fromEmail }).from(emailFollowUpsTable).innerJoin(emailsTable, eq(emailFollowUpsTable.emailId, emailsTable.id)).where(and(eq(emailFollowUpsTable.userId, userId), eq(emailsTable.userId, userId))).orderBy(emailFollowUpsTable.remindAt);
}

export async function createFollowUp(userId: string, input: FollowUpInput): Promise<EmailFollowUp> {
  await ownedEmail(userId, input.emailId);
  const remindAt = new Date(input.remindAt);
  if (Number.isNaN(remindAt.getTime()) || remindAt <= new Date()) throw Object.assign(new Error("Follow-up reminder must be a future date"), { statusCode: 400 });
  const [existing] = await db.select().from(emailFollowUpsTable).where(and(eq(emailFollowUpsTable.userId, userId), eq(emailFollowUpsTable.emailId, input.emailId), eq(emailFollowUpsTable.status, "open"))).limit(1);
  if (existing) {
    const [updated] = await db.update(emailFollowUpsTable).set({ remindAt, note: String(input.note ?? ""), updatedAt: new Date() }).where(eq(emailFollowUpsTable.id, existing.id)).returning();
    return updated;
  }
  const [followUp] = await db.insert(emailFollowUpsTable).values({ userId, emailId: input.emailId, remindAt, note: String(input.note ?? "") }).returning();
  return followUp;
}

export async function updateFollowUp(userId: string, id: string, input: { status?: "open" | "snoozed" | "completed" | "dismissed"; remindAt?: string; note?: string }): Promise<EmailFollowUp> {
  const remindAt = input.remindAt === undefined ? undefined : new Date(input.remindAt);
  if (remindAt instanceof Date && (Number.isNaN(remindAt.getTime()) || remindAt <= new Date())) throw Object.assign(new Error("Follow-up reminder must be a future date"), { statusCode: 400 });
  const status = input.status;
  const [followUp] = await db.update(emailFollowUpsTable).set({ ...(status !== undefined ? { status, completedAt: status === "completed" ? new Date() : null } : {}), ...(remindAt !== undefined ? { remindAt } : {}), ...(input.note !== undefined ? { note: String(input.note) } : {}), updatedAt: new Date() }).where(and(eq(emailFollowUpsTable.id, id), eq(emailFollowUpsTable.userId, userId))).returning();
  return owned(followUp, userId, "Follow-up not found");
}

function parseWorkspaceQuery(query: string) {
  const normalized = query.trim().replace(/\s+/g, " ");
  const filters: string[] = [];
  if (/\b(unread|غير مقروء|غير مقروءة)\b/i.test(normalized)) filters.push("unread");
  if (/\b(starred|مهم|مميزة)\b/i.test(normalized)) filters.push("starred");
  if (/\b(attachment|attachments|مرفق|مرفقات)\b/i.test(normalized)) filters.push("has_attachment");
  if (/\b(today|اليوم)\b/i.test(normalized)) filters.push("today");
  if (/\b(this week|هذا الأسبوع)\b/i.test(normalized)) filters.push("this_week");
  if (/\b(task|tasks|مهمة|مهام)\b/i.test(normalized)) filters.push("has_task");
  const fromMatch = normalized.match(/(?:from|من)[:\s]+([^\s]+)/i);
  if (fromMatch?.[1]) filters.push(`from:${fromMatch[1]}`);
  const priorityMatch = normalized.match(/(?:priority|أولوية)[:\s]+(high|normal|low|عالية|متوسطة|منخفضة)/i);
  if (priorityMatch?.[1]) filters.push(`priority:${priorityMatch[1].toLowerCase()}`);
  const folderMatch = normalized.match(/(?:folder|مجلد)[:\s]+(inbox|sent|archive|trash|drafts|spam|الوارد|المرسل|الأرشيف|المحذوفات|المسودات|مزعج)/i);
  if (folderMatch?.[1]) filters.push(`folder:${folderMatch[1].toLowerCase()}`);
  const afterMatch = normalized.match(/(?:after|بعد)[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (afterMatch?.[1]) filters.push(`after:${afterMatch[1]}`);
  const beforeMatch = normalized.match(/(?:before|قبل)[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (beforeMatch?.[1]) filters.push(`before:${beforeMatch[1]}`);
  const terms = normalized.replace(/(?:from|من)[:\s]+[^\s]+/gi, " ").replace(/(?:priority|أولوية)[:\s]+(?:high|normal|low|عالية|متوسطة|منخفضة)/gi, " ").replace(/(?:folder|مجلد)[:\s]+(?:inbox|sent|archive|trash|drafts|spam|الوارد|المرسل|الأرشيف|المحذوفات|المسودات|مزعج)/gi, " ").replace(/(?:after|before|بعد|قبل)[:\s]+\d{4}-\d{2}-\d{2}/gi, " ").replace(/\b(unread|starred|attachment|attachments|today|this week|task|tasks|غير مقروء|مرفق|اليوم|هذا الأسبوع|أولوية|مجلد|مهمة|مهام)\b/gi, " ").replace(/\s+/g, " ").trim();
  return { raw: normalized, terms, filters };
}

function smartScore(email: { isRead: boolean; isStarred: boolean; category: string; subject: string; bodyText: string; fromEmail: string; labels: string[] | null }) {
  const haystack = `${email.subject} ${email.bodyText}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  if (!email.isRead) { score += 30; reasons.push("unread"); }
  if (email.isStarred) { score += 24; reasons.push("starred"); }
  if (email.category === "primary") { score += 18; reasons.push("primary"); }
  if (/(deadline|due|urgent|asap|follow up|action required|موعد|عاجل|متابعة|مطلوب)/i.test(haystack)) { score += 22; reasons.push("deadline_or_action"); }
  if (/(project|client|meeting|invoice|work|مشروع|عميل|اجتماع|فاتورة|عمل)/i.test(haystack)) { score += 12; reasons.push("work_context"); }
  if ((email.labels ?? []).some((label) => /important|priority/i.test(label))) { score += 10; reasons.push("label"); }
  return { score, reasons };
}

export async function listSmartInbox(userId: string, query = "") {
  const plan = parseWorkspaceQuery(query);
  const folderAliases: Record<string, string> = { inbox: "inbox", sent: "sent", archive: "archive", trash: "trash", drafts: "drafts", spam: "spam", starred: "starred", الوارد: "inbox", المرسل: "sent", الأرشيف: "archive", المحذوفات: "trash", المسودات: "drafts", مزعج: "spam" };
  const folderFilter = plan.filters.find((filter) => filter.startsWith("folder:"))?.slice("folder:".length);
  const selectedFolder = folderFilter ? folderAliases[folderFilter] : "inbox";
  const conditions = [eq(emailsTable.userId, userId), eq(emailsTable.folder, (selectedFolder || "inbox") as "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash" | "spam")];
  const fromFilter = plan.filters.find((filter) => filter.startsWith("from:"))?.slice("from:".length);
  if (fromFilter) conditions.push(ilike(emailsTable.fromEmail, `%${fromFilter}%`));
  const now = new Date();
  if (plan.filters.includes("today")) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    conditions.push(gte(emailsTable.createdAt, startOfDay), lte(emailsTable.createdAt, now));
  }
  if (plan.filters.includes("this_week")) {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    conditions.push(gte(emailsTable.createdAt, startOfWeek), lte(emailsTable.createdAt, now));
  }
  const afterFilter = plan.filters.find((filter) => filter.startsWith("after:"))?.slice("after:".length);
  if (afterFilter) conditions.push(gte(emailsTable.createdAt, new Date(`${afterFilter}T00:00:00.000Z`)));
  const beforeFilter = plan.filters.find((filter) => filter.startsWith("before:"))?.slice("before:".length);
  if (beforeFilter) conditions.push(lte(emailsTable.createdAt, new Date(`${beforeFilter}T23:59:59.999Z`)));
  if (plan.terms) {
    const like = `%${plan.terms}%`;
    conditions.push(or(ilike(emailsTable.subject, like), ilike(emailsTable.bodyText, like), ilike(emailsTable.fromEmail, like))!);
  }
  const rows = await db.select().from(emailsTable).where(and(...conditions)).orderBy(desc(emailsTable.createdAt)).limit(100);
  const taskEmailIds = plan.filters.includes("has_task") ? new Set((await db.select({ emailId: tasksTable.emailId }).from(tasksTable).where(eq(tasksTable.userId, userId))).map((row) => row.emailId).filter((id): id is string => Boolean(id))) : null;
  const ranked = rows.map((email) => ({ email, ...smartScore(email) })).filter((item) => {
    const { email, score } = item;
    if (plan.filters.includes("unread") && email.isRead) return false;
    if (plan.filters.includes("starred") && !email.isStarred) return false;
    if (plan.filters.includes("has_attachment") && !Array.isArray(email.attachments as unknown[] | null) || plan.filters.includes("has_attachment") && !(email.attachments as unknown[]).length) return false;
    if (plan.filters.includes("has_task") && !taskEmailIds?.has(email.id)) return false;
    const priorityFilter = plan.filters.find((filter) => filter.startsWith("priority:"))?.slice("priority:".length);
    if (priorityFilter && ((priorityFilter === "high" || priorityFilter === "عالية") ? score < 55 : priorityFilter === "low" || priorityFilter === "منخفضة" ? score >= 55 : score >= 80)) return false;
    return true;
  }).sort((a, b) => b.score - a.score || b.email.createdAt.getTime() - a.email.createdAt.getTime());
  return { queryPlan: plan, emails: ranked };
}

export async function getWorkspace(userId: string, query = "") {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [smartInbox, tasks, events, followUps, drafts] = await Promise.all([
    listSmartInbox(userId, query),
    listTasks(userId),
    listCalendarEvents(userId, now.toISOString(), nextWeek.toISOString()),
    listFollowUps(userId),
    db.select().from(emailsTable).where(and(eq(emailsTable.userId, userId), eq(emailsTable.isDraft, true))).orderBy(desc(emailsTable.createdAt)).limit(20),
  ]);
  return {
    smartInbox,
    overdueTasks: tasks.filter((task) => task.status === "open" && task.dueAt && task.dueAt < now),
    tasks,
    upcomingEvents: events,
    drafts,
    followUps: followUps.filter((followUp) => followUp.status === "open" || followUp.status === "snoozed"),
    generatedAt: now.toISOString(),
  };
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
