import { and, desc, eq, gt, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
  gmailConnectionsTable,
  usersTable,
  tasksTable,
  workspacePreferencesTable,
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

export type FocusMode = "focus" | "work" | "follow_up";
export type AccountScope = string | null | undefined;

async function resolveAccountScope(userId: string, accountId: string | null | undefined): Promise<string | null | undefined> {
  if (accountId === undefined || accountId === "all") return undefined;
  if (accountId === null || accountId === "local") return null;
  const [account] = await db.select({ id: gmailConnectionsTable.id }).from(gmailConnectionsTable).where(and(eq(gmailConnectionsTable.id, accountId), eq(gmailConnectionsTable.userId, userId))).limit(1);
  if (!account) throw Object.assign(new Error("Account not found"), { statusCode: 404 });
  return account.id;
}

export async function listProductivityAccounts(userId: string) {
  const [user] = await db.select({ email: usersTable.email, displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const connections = await db.select({ id: gmailConnectionsTable.id, provider: gmailConnectionsTable.provider, externalAccountId: gmailConnectionsTable.externalAccountId, emailAddress: gmailConnectionsTable.emailAddress, displayName: gmailConnectionsTable.displayName, syncStatus: gmailConnectionsTable.syncStatus, lastSyncedAt: gmailConnectionsTable.lastSyncedAt, createdAt: gmailConnectionsTable.createdAt }).from(gmailConnectionsTable).where(eq(gmailConnectionsTable.userId, userId)).orderBy(gmailConnectionsTable.createdAt);
  const preferences = await getWorkspacePreferences(userId);
  return {
    activeAccountId: preferences.activeAccountId ?? "all",
    accounts: [{ id: "local", provider: "local", externalAccountId: "local", emailAddress: user?.email ?? "", displayName: user?.displayName ?? null, syncStatus: "connected", lastSyncedAt: null, createdAt: null }, ...connections.map((account) => ({ ...account, lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null, createdAt: account.createdAt.toISOString() }))],
    providerAvailability: { gmail: Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET), outlook: false, smtp: Boolean(process.env.SMTP_HOST) },
  };
}

export async function setActiveAccount(userId: string, accountId: string | null) {
  const resolved = await resolveAccountScope(userId, accountId);
  await getWorkspacePreferences(userId);
  const [updated] = await db.update(workspacePreferencesTable).set({ activeAccountId: resolved, updatedAt: new Date() }).where(eq(workspacePreferencesTable.userId, userId)).returning();
  return { activeAccountId: updated.activeAccountId ?? "all" };
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

function addAccountCondition<T extends { accountId: unknown }>(conditions: unknown[], table: T, scope: string | null | undefined) {
  if (scope === undefined) return;
  conditions.push(scope === null ? isNull(table.accountId as never) : eq(table.accountId as never, scope));
}

export async function listTasks(userId: string, accountId?: string | null): Promise<Task[]> {
  const scope = await resolveAccountScope(userId, accountId);
  const conditions: unknown[] = [eq(tasksTable.userId, userId)];
  addAccountCondition(conditions, tasksTable, scope);
  return db.select().from(tasksTable).where(and(...(conditions as Parameters<typeof and>))).orderBy(desc(tasksTable.createdAt));
}

export async function createTask(userId: string, input: { title: string; notes?: string; emailId?: string | null; accountId?: string | null; dueAt?: string | null; priority?: "low" | "normal" | "high" }): Promise<Task> {
  const title = String(input.title ?? "").trim();
  if (!title) throw Object.assign(new Error("Task title is required"), { statusCode: 400 });
  const scope = await resolveAccountScope(userId, input.accountId);
  const linkedEmail = input.emailId ? await ownedEmail(userId, input.emailId) : null;
  if (linkedEmail && input.accountId !== undefined && (linkedEmail.accountId ?? null) !== scope) throw Object.assign(new Error("Email belongs to another account"), { statusCode: 404 });
  const effectiveAccountId = linkedEmail?.accountId ?? scope ?? null;
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw Object.assign(new Error("Invalid task due date"), { statusCode: 400 });
  const [task] = await db.insert(tasksTable).values({ userId, accountId: effectiveAccountId, title, notes: String(input.notes ?? ""), emailId: input.emailId ?? null, dueAt, priority: input.priority ?? "normal" }).returning();
  return task;
}

export async function updateTask(userId: string, id: string, input: Partial<{ title: string; notes: string; dueAt: string | null; status: "open" | "completed"; priority: "low" | "normal" | "high"; expectedVersion: number }>): Promise<Task> {
  const nextDueAt = input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null;
  if (nextDueAt instanceof Date && Number.isNaN(nextDueAt.getTime())) throw Object.assign(new Error("Invalid task due date"), { statusCode: 400 });
  const nextStatus = input.status;
  const conditions: unknown[] = [eq(tasksTable.id, id), eq(tasksTable.userId, userId)];
  if (input.expectedVersion !== undefined) conditions.push(eq(tasksTable.version, input.expectedVersion));
  const [task] = await db.update(tasksTable).set({ ...(input.title !== undefined ? { title: String(input.title).trim() } : {}), ...(input.notes !== undefined ? { notes: String(input.notes) } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}), ...(input.dueAt !== undefined ? { dueAt: nextDueAt } : {}), ...(nextStatus !== undefined ? { status: nextStatus, completedAt: nextStatus === "completed" ? new Date() : null } : {}), ...(input.expectedVersion !== undefined ? { version: sql`${tasksTable.version} + 1` } : {}), updatedAt: new Date() }).where(and(...(conditions as Parameters<typeof and>))).returning();
  if (!task) throw Object.assign(new Error(input.expectedVersion !== undefined ? "Task version conflict" : "Task not found"), { statusCode: input.expectedVersion !== undefined ? 409 : 404 });
  return task;
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  const deleted = await db.delete(tasksTable).where(and(eq(tasksTable.id, id), eq(tasksTable.userId, userId))).returning({ id: tasksTable.id });
  if (!deleted.length) throw Object.assign(new Error("Task not found"), { statusCode: 404 });
}

export async function suggestCalendarEvent(userId: string, emailId: string) {
  const email = await ownedEmail(userId, emailId);
  return meetingSuggestion({ subject: email.subject, bodyText: email.bodyText, fromEmail: email.fromEmail });
}

export async function createCalendarEvent(userId: string, input: { emailId?: string | null; accountId?: string | null; title: string; description?: string; location?: string | null; startsAt: string; endsAt: string; attendees?: string[] }): Promise<CalendarEvent> {
  const scope = await resolveAccountScope(userId, input.accountId);
  const linkedEmail = input.emailId ? await ownedEmail(userId, input.emailId) : null;
  if (linkedEmail && input.accountId !== undefined && (linkedEmail.accountId ?? null) !== scope) throw Object.assign(new Error("Email belongs to another account"), { statusCode: 404 });
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw Object.assign(new Error("Invalid calendar event time range"), { statusCode: 400 });
  const [event] = await db.insert(calendarEventsTable).values({ userId, accountId: linkedEmail?.accountId ?? scope ?? null, emailId: input.emailId ?? null, title: String(input.title ?? "Meeting").trim() || "Meeting", description: String(input.description ?? ""), location: input.location ?? null, startsAt, endsAt, attendees: input.attendees ?? [] }).returning();
  return event;
}

export async function listCalendarEvents(userId: string, from?: string, to?: string, accountId?: string | null): Promise<CalendarEvent[]> {
  const scope = await resolveAccountScope(userId, accountId);
  const conditions: unknown[] = [eq(calendarEventsTable.userId, userId)];
  addAccountCondition(conditions, calendarEventsTable, scope);
  if (from) conditions.push(gte(calendarEventsTable.startsAt, new Date(from)));
  if (to) conditions.push(lte(calendarEventsTable.startsAt, new Date(to)));
  return db.select().from(calendarEventsTable).where(and(...(conditions as Parameters<typeof and>))).orderBy(calendarEventsTable.startsAt);
}

export async function deleteCalendarEvent(userId: string, id: string): Promise<void> {
  const deleted = await db.delete(calendarEventsTable).where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId))).returning({ id: calendarEventsTable.id });
  if (!deleted.length) throw Object.assign(new Error("Calendar event not found"), { statusCode: 404 });
}

export type FollowUpInput = { emailId: string; accountId?: string | null; remindAt: string; note?: string; waitingForReply?: boolean };

export async function listFollowUps(userId: string, accountId?: string | null) {
  const scope = await resolveAccountScope(userId, accountId);
  const conditions: unknown[] = [eq(emailFollowUpsTable.userId, userId), eq(emailsTable.userId, userId)];
  addAccountCondition(conditions, emailFollowUpsTable, scope);
  addAccountCondition(conditions, emailsTable, scope);
  return db.select({ id: emailFollowUpsTable.id, accountId: emailFollowUpsTable.accountId, emailId: emailFollowUpsTable.emailId, remindAt: emailFollowUpsTable.remindAt, status: emailFollowUpsTable.status, note: emailFollowUpsTable.note, waitingForReply: emailFollowUpsTable.waitingForReply, version: emailFollowUpsTable.version, completedAt: emailFollowUpsTable.completedAt, createdAt: emailFollowUpsTable.createdAt, emailSubject: emailsTable.subject, fromEmail: emailsTable.fromEmail }).from(emailFollowUpsTable).innerJoin(emailsTable, eq(emailFollowUpsTable.emailId, emailsTable.id)).where(and(...(conditions as Parameters<typeof and>))).orderBy(emailFollowUpsTable.remindAt);
}

export async function createFollowUp(userId: string, input: FollowUpInput): Promise<EmailFollowUp> {
  const email = await ownedEmail(userId, input.emailId);
  const scope = await resolveAccountScope(userId, input.accountId);
  if (input.accountId !== undefined && (email.accountId ?? null) !== scope) throw Object.assign(new Error("Email belongs to another account"), { statusCode: 404 });
  const effectiveAccountId = email.accountId ?? scope ?? null;
  const remindAt = new Date(input.remindAt);
  if (Number.isNaN(remindAt.getTime()) || remindAt <= new Date()) throw Object.assign(new Error("Follow-up reminder must be a future date"), { statusCode: 400 });
  const [existing] = await db.select().from(emailFollowUpsTable).where(and(eq(emailFollowUpsTable.userId, userId), eq(emailFollowUpsTable.emailId, input.emailId), eq(emailFollowUpsTable.status, "open"))).limit(1);
  if (existing) {
    const [updated] = await db.update(emailFollowUpsTable).set({ accountId: effectiveAccountId, remindAt, note: String(input.note ?? ""), waitingForReply: input.waitingForReply ?? true, updatedAt: new Date() }).where(eq(emailFollowUpsTable.id, existing.id)).returning();
    return updated;
  }
  const [followUp] = await db.insert(emailFollowUpsTable).values({ userId, accountId: effectiveAccountId, emailId: input.emailId, remindAt, note: String(input.note ?? ""), waitingForReply: input.waitingForReply ?? true }).returning();
  return followUp;
}

export async function reconcileFollowUpsForIncomingReply(userId: string, incomingEmailId: string): Promise<{ closed: number }> {
  const [incoming, owner] = await Promise.all([
    db.select().from(emailsTable).where(and(eq(emailsTable.id, incomingEmailId), eq(emailsTable.userId, userId))).limit(1).then(([row]) => row),
    db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1).then(([row]) => row),
  ]);
  if (!incoming || incoming.isDraft || incoming.fromEmail.toLowerCase() === owner?.email.toLowerCase()) return { closed: 0 };
  const candidates = await db.select({ followUpId: emailFollowUpsTable.id, emailId: emailFollowUpsTable.emailId, threadId: emailsTable.threadId, messageId: emailsTable.messageId }).from(emailFollowUpsTable).innerJoin(emailsTable, eq(emailFollowUpsTable.emailId, emailsTable.id)).where(and(eq(emailFollowUpsTable.userId, userId), eq(emailFollowUpsTable.waitingForReply, true), inArray(emailFollowUpsTable.status, ["open", "snoozed"])));
  const incomingReferences = new Set((incoming.references as string[] | null) ?? []);
  let closed = 0;
  for (const candidate of candidates) {
    const linked = Boolean(
      (candidate.threadId && incoming.threadId && candidate.threadId === incoming.threadId) ||
      incoming.replyToId === candidate.emailId ||
      (candidate.messageId && incoming.inReplyTo === candidate.messageId) ||
      (candidate.messageId && incomingReferences.has(candidate.messageId)),
    );
    if (!linked) continue;
    const updated = await db.update(emailFollowUpsTable).set({ status: "completed", waitingForReply: false, completedAt: new Date(), updatedAt: new Date() }).where(and(eq(emailFollowUpsTable.id, candidate.followUpId), eq(emailFollowUpsTable.waitingForReply, true), inArray(emailFollowUpsTable.status, ["open", "snoozed"]))).returning({ id: emailFollowUpsTable.id });
    closed += updated.length;
  }
  return { closed };
}

export type FollowUpReconciliationResult = { locked: boolean; inspected: number; closed: number };

/**
 * Periodic, scheduler-owned reconciliation for replies imported by a provider.
 * The transaction advisory lock makes this safe across scheduler replicas; the
 * conditional update makes a concurrent inbound fan-out or manual completion win
 * exactly once. It never translates content and never considers drafts/outbound mail.
 */
export async function reconcileOpenFollowUps(lockKey = "zephyx:productivity:follow-up-reconciliation"): Promise<FollowUpReconciliationResult> {
  return db.transaction(async (tx) => {
    const lockResult = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS locked`);
    const locked = Boolean((lockResult.rows[0] as { locked?: boolean } | undefined)?.locked);
    if (!locked) return { locked: false, inspected: 0, closed: 0 };

    const candidates = await tx.select({
      followUpId: emailFollowUpsTable.id,
      userId: emailFollowUpsTable.userId,
      accountId: emailFollowUpsTable.accountId,
      sourceEmailId: emailFollowUpsTable.emailId,
      sourceCreatedAt: emailsTable.createdAt,
      sourceThreadId: emailsTable.threadId,
      sourceMessageId: emailsTable.messageId,
      ownerEmail: usersTable.email,
    }).from(emailFollowUpsTable)
      .innerJoin(emailsTable, eq(emailFollowUpsTable.emailId, emailsTable.id))
      .innerJoin(usersTable, eq(emailFollowUpsTable.userId, usersTable.id))
      .where(and(eq(emailFollowUpsTable.waitingForReply, true), inArray(emailFollowUpsTable.status, ["open", "snoozed"])));

    let closed = 0;
    for (const candidate of candidates) {
      const replyConditions: unknown[] = [
        eq(emailsTable.userId, candidate.userId),
        eq(emailsTable.isDraft, false),
        gt(emailsTable.createdAt, candidate.sourceCreatedAt),
        sql`lower(${emailsTable.fromEmail}) <> lower(${candidate.ownerEmail})`,
      ];
      if (candidate.accountId === null) replyConditions.push(isNull(emailsTable.accountId));
      else replyConditions.push(eq(emailsTable.accountId, candidate.accountId));

      const replies = await tx.select({
        threadId: emailsTable.threadId,
        replyToId: emailsTable.replyToId,
        inReplyTo: emailsTable.inReplyTo,
        references: emailsTable.references,
      }).from(emailsTable).where(and(...(replyConditions as Parameters<typeof and>)));

      const linkedReply = replies.some((reply) => {
        const references = new Set((reply.references as string[] | null) ?? []);
        return Boolean(
          (candidate.sourceThreadId && reply.threadId && candidate.sourceThreadId === reply.threadId) ||
          reply.replyToId === candidate.sourceEmailId ||
          (candidate.sourceMessageId && reply.inReplyTo === candidate.sourceMessageId) ||
          (candidate.sourceMessageId && references.has(candidate.sourceMessageId)),
        );
      });
      if (!linkedReply) continue;

      const updated = await tx.update(emailFollowUpsTable).set({
        status: "completed",
        waitingForReply: false,
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(emailFollowUpsTable.id, candidate.followUpId),
        eq(emailFollowUpsTable.waitingForReply, true),
        inArray(emailFollowUpsTable.status, ["open", "snoozed"]),
      )).returning({ id: emailFollowUpsTable.id });
      closed += updated.length;
    }
    return { locked: true, inspected: candidates.length, closed };
  });
}

export async function updateFollowUp(userId: string, id: string, input: { status?: "open" | "snoozed" | "completed" | "dismissed"; remindAt?: string; note?: string; waitingForReply?: boolean; expectedVersion?: number }): Promise<EmailFollowUp> {
  const remindAt = input.remindAt === undefined ? undefined : new Date(input.remindAt);
  if (remindAt instanceof Date && (Number.isNaN(remindAt.getTime()) || remindAt <= new Date())) throw Object.assign(new Error("Follow-up reminder must be a future date"), { statusCode: 400 });
  const status = input.status;
  const conditions: unknown[] = [eq(emailFollowUpsTable.id, id), eq(emailFollowUpsTable.userId, userId)];
  if (input.expectedVersion !== undefined) conditions.push(eq(emailFollowUpsTable.version, input.expectedVersion));
  const [followUp] = await db.update(emailFollowUpsTable).set({ ...(status !== undefined ? { status, completedAt: status === "completed" ? new Date() : null } : {}), ...(remindAt !== undefined ? { remindAt } : {}), ...(input.note !== undefined ? { note: String(input.note) } : {}), ...(input.waitingForReply !== undefined ? { waitingForReply: input.waitingForReply } : {}), ...(input.expectedVersion !== undefined ? { version: sql`${emailFollowUpsTable.version} + 1` } : {}), updatedAt: new Date() }).where(and(...(conditions as Parameters<typeof and>))).returning();
  if (!followUp) throw Object.assign(new Error(input.expectedVersion !== undefined ? "Follow-up version conflict" : "Follow-up not found"), { statusCode: input.expectedVersion !== undefined ? 409 : 404 });
  return followUp;
}

const DEFAULT_VISIBLE_SECTIONS = ["important", "follow_up", "work", "meetings", "deadlines", "personal", "tasks", "drafts"];
const DEFAULT_VISIBLE_COLUMNS = ["sender", "subject", "date", "priority"];

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))).slice(0, 24);
}

function preferenceText(value: unknown, fallback: string, allowed: string[]): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

export async function getWorkspacePreferences(userId: string) {
  const [existing] = await db.select().from(workspacePreferencesTable).where(eq(workspacePreferencesTable.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(workspacePreferencesTable).values({ userId, visibleSections: DEFAULT_VISIBLE_SECTIONS, visibleColumns: DEFAULT_VISIBLE_COLUMNS }).returning();
  return created;
}

export async function updateWorkspacePreferences(userId: string, input: Record<string, unknown>) {
  const current = await getWorkspacePreferences(userId);
  const activeAccountId = input.activeAccountId === undefined ? current.activeAccountId : await resolveAccountScope(userId, typeof input.activeAccountId === "string" ? input.activeAccountId : null);
  const [updated] = await db.update(workspacePreferencesTable).set({
    activeAccountId,
    focusMode: preferenceText(input.focusMode, current.focusMode ?? "focus", ["focus", "work", "follow_up"]),
    privacyExternalImagesBlocked: typeof input.privacyExternalImagesBlocked === "boolean" ? input.privacyExternalImagesBlocked : current.privacyExternalImagesBlocked,
    privacyTrackingPixelsBlocked: typeof input.privacyTrackingPixelsBlocked === "boolean" ? input.privacyTrackingPixelsBlocked : current.privacyTrackingPixelsBlocked,
    inboxDensity: preferenceText(input.inboxDensity, current.inboxDensity ?? "comfortable", ["comfortable", "compact"]),
    inboxLayout: preferenceText(input.inboxLayout, current.inboxLayout ?? "two-pane", ["two-pane", "list", "split"]),
    visibleSections: input.visibleSections === undefined ? current.visibleSections : stringList(input.visibleSections, DEFAULT_VISIBLE_SECTIONS),
    visibleColumns: input.visibleColumns === undefined ? current.visibleColumns : stringList(input.visibleColumns, DEFAULT_VISIBLE_COLUMNS),
    accentColor: preferenceText(input.accentColor, current.accentColor ?? "indigo", ["indigo", "violet", "emerald", "amber", "rose"]),
    theme: preferenceText(input.theme, current.theme ?? "system", ["light", "dark", "system"]),
    keyboardShortcuts: input.keyboardShortcuts === undefined ? current.keyboardShortcuts : typeof input.keyboardShortcuts === "object" && input.keyboardShortcuts !== null ? input.keyboardShortcuts as Record<string, string> : {},
    savedSearches: input.savedSearches === undefined ? current.savedSearches : stringList(input.savedSearches, []),
    updatedAt: new Date(),
  }).where(eq(workspacePreferencesTable.userId, userId)).returning();
  return updated;
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
  if (/\b(deadline|deadlines|due|استحقاق|موعد نهائي)\b/i.test(normalized)) filters.push("deadline");
  if (/\b(personal|شخصي|شخصية)\b/i.test(normalized)) filters.push("personal");
  if (/\b(meeting|meetings|اجتماع|اجتماعات)\b/i.test(normalized)) filters.push("meeting");
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
  const terms = normalized.replace(/(?:from|من)[:\s]+[^\s]+/gi, " ").replace(/(?:priority|أولوية)[:\s]+(?:high|normal|low|عالية|متوسطة|منخفضة)/gi, " ").replace(/(?:folder|مجلد)[:\s]+(?:inbox|sent|archive|trash|drafts|spam|الوارد|المرسل|الأرشيف|المحذوفات|المسودات|مزعج)/gi, " ").replace(/(?:after|before|بعد|قبل)[:\s]+\d{4}-\d{2}-\d{2}/gi, " ").replace(/\b(unread|starred|attachment|attachments|today|this week|task|tasks|deadline|deadlines|due|personal|meeting|meetings|غير مقروء|مرفق|اليوم|هذا الأسبوع|أولوية|مجلد|مهمة|مهام|استحقاق|موعد نهائي|شخصي|شخصية|اجتماع|اجتماعات)\b/gi, " ").replace(/\s+/g, " ").trim();
  return { raw: normalized, terms, filters };
}

function smartScore(email: { isRead: boolean; isStarred: boolean; category: string; subject: string; bodyText: string; fromEmail: string; labels: string[] | null }) {
  const haystack = `${email.subject} ${email.bodyText}`.toLowerCase();
  const labels = new Set(email.labels ?? []);
  const reasons: string[] = [];
  let score = 0;
  const hasDeadline = /(deadline|due|urgent|asap|action required|موعد نهائي|استحقاق|عاجل|مطلوب)/i.test(haystack);
  const needsFollowUp = labels.has("FOLLOW_UP") || /(follow[ -]?up|awaiting (a )?reply|needs? reply|بانتظار الرد|متابعة)/i.test(haystack);
  const isMeeting = /(meeting|calendar|appointment|invite|schedule|اجتماع|موعد|دعوة)/i.test(haystack);
  const isWork = labels.has("CATEGORY_WORK") || /(project|client|invoice|work|proposal|مشروع|عميل|فاتورة|عمل)/i.test(haystack);
  const isPersonal = email.category === "social" || email.category === "promotional" || labels.has("CATEGORY_PERSONAL") || /(family|personal|عائلة|شخصي|شخصية)/i.test(haystack);
  if (!email.isRead) { score += 30; reasons.push("unread"); }
  if (email.isStarred) { score += 24; reasons.push("starred"); }
  if (email.category === "primary") { score += 18; reasons.push("primary"); }
  if (hasDeadline) { score += 26; reasons.push("deadline"); }
  if (needsFollowUp) { score += 20; reasons.push("follow_up"); }
  if (isMeeting) { score += 14; reasons.push("meeting"); }
  if (isWork) { score += 12; reasons.push("work_context"); }
  if (isPersonal) { reasons.push("personal"); }
  if (labels.has("IMPORTANT") || Array.from(labels).some((label) => /important|priority/i.test(label))) { score += 10; reasons.push("label"); }
  return { score, reasons, hasDeadline, needsFollowUp, isMeeting, isWork, isPersonal };
}

export async function listSmartInbox(userId: string, query = "", accountId?: string | null, focusMode: FocusMode = "focus") {
  const plan = parseWorkspaceQuery(query);
  const folderAliases: Record<string, string> = { inbox: "inbox", sent: "sent", archive: "archive", trash: "trash", drafts: "drafts", spam: "spam", starred: "starred", الوارد: "inbox", المرسل: "sent", الأرشيف: "archive", المحذوفات: "trash", المسودات: "drafts", مزعج: "spam" };
  const folderFilter = plan.filters.find((filter) => filter.startsWith("folder:"))?.slice("folder:".length);
  const selectedFolder = folderFilter ? folderAliases[folderFilter] : "inbox";
  const scope = await resolveAccountScope(userId, accountId);
  const conditions: unknown[] = [eq(emailsTable.userId, userId), eq(emailsTable.folder, (selectedFolder || "inbox") as "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash" | "spam")];
  addAccountCondition(conditions, emailsTable, scope);
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
  const rows = await db.select().from(emailsTable).where(and(...(conditions as Parameters<typeof and>))).orderBy(desc(emailsTable.createdAt)).limit(100);
  const taskConditions: unknown[] = [eq(tasksTable.userId, userId)];
  addAccountCondition(taskConditions, tasksTable, scope);
  const taskEmailIds = plan.filters.includes("has_task") ? new Set((await db.select({ emailId: tasksTable.emailId }).from(tasksTable).where(and(...(taskConditions as Parameters<typeof and>)))).map((row) => row.emailId).filter((id): id is string => Boolean(id))) : null;
  const ranked = rows.map((email) => ({ email, ...smartScore(email) })).filter((item) => {
    const { email, score } = item;
    if (plan.filters.includes("unread") && email.isRead) return false;
    if (plan.filters.includes("starred") && !email.isStarred) return false;
    if (plan.filters.includes("has_attachment") && !Array.isArray(email.attachments as unknown[] | null) || plan.filters.includes("has_attachment") && !(email.attachments as unknown[]).length) return false;
    if (plan.filters.includes("has_task") && !taskEmailIds?.has(email.id)) return false;
    if (plan.filters.includes("deadline") && !item.hasDeadline) return false;
    if (plan.filters.includes("personal") && !item.isPersonal) return false;
    if (plan.filters.includes("meeting") && !item.isMeeting) return false;
    if (focusMode === "work" && !item.isWork) return false;
    if (focusMode === "follow_up" && !item.needsFollowUp) return false;
    if (focusMode === "focus" && item.score < 30) return false;
    const priorityFilter = plan.filters.find((filter) => filter.startsWith("priority:"))?.slice("priority:".length);
    if (priorityFilter && ((priorityFilter === "high" || priorityFilter === "عالية") ? score < 55 : priorityFilter === "low" || priorityFilter === "منخفضة" ? score >= 55 : score >= 80)) return false;
    return true;
  }).sort((a, b) => b.score - a.score || b.email.createdAt.getTime() - a.email.createdAt.getTime());
  return { queryPlan: plan, emails: ranked };
}

export async function getWorkspace(userId: string, query = "", accountId?: string | null, requestedFocusMode?: string) {
  const now = new Date();
  const preferences = await getWorkspacePreferences(userId);
  const focusMode = preferenceText(requestedFocusMode, preferences.focusMode ?? "focus", ["focus", "work", "follow_up"]) as FocusMode;
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [smartInbox, tasks, events, followUps, drafts] = await Promise.all([
    listSmartInbox(userId, query, accountId, focusMode),
    listTasks(userId, accountId),
    listCalendarEvents(userId, now.toISOString(), nextWeek.toISOString(), accountId),
    listFollowUps(userId, accountId),
    (async () => { const scope = await resolveAccountScope(userId, accountId); const draftConditions: unknown[] = [eq(emailsTable.userId, userId), eq(emailsTable.isDraft, true)]; addAccountCondition(draftConditions, emailsTable, scope); return db.select().from(emailsTable).where(and(...(draftConditions as Parameters<typeof and>))).orderBy(desc(emailsTable.createdAt)).limit(20); })(),
  ]);
  return {
    smartInbox,
    overdueTasks: tasks.filter((task) => task.status === "open" && task.dueAt && task.dueAt < now),
    tasks,
    upcomingEvents: events,
    drafts,
    followUps: followUps.filter((followUp) => followUp.status === "open" || followUp.status === "snoozed"),
    generatedAt: now.toISOString(),
    accountId: accountId === undefined ? "all" : accountId ?? "local",
    focusMode,
    savedSearches: preferences.savedSearches,
    quickActions: ["create_task", "create_event", "follow_up", "search"],
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
