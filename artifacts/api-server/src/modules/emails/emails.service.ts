import { foldersTable } from "@workspace/db";
import { getMailer } from "../../lib/mailer.js";
import { logger } from "../../lib/logger.js";
import { insertEmailDispatchOutbox, publishOutboxJob, sanitizeQueueError } from "../../lib/outbox.js";
import { randomUUID } from "node:crypto";
import { publishUserEvent } from "../../lib/realtime.js";
import { eq, and, or, ilike, count, sql, desc, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { EMAIL_CATEGORIES, emailsTable, gmailConnectionsTable, usersTable } from "@workspace/db";
import type { EmailAddress, EmailAttachment, EmailCategory } from "@workspace/db";
import { isEmailCategory, normalizeEmailCategory } from "./category.service.js";
import {
  findSubjectThreadParent,
  getThreadParticipantEmails,
  isReplySubject,
  normalizeThreadSubject,
  type ThreadCandidate,
} from "./email-threading.js";
import {
  cleanupAttachmentCandidates,
  normalizeAttachmentsForUser,
  removedAttachments,
  toOutboundAttachments,
} from "./attachments.service.js";

import {
  modifyGmailMessageLabels,
  trashGmailMessage,
  untrashGmailMessage,
} from "../gmail/gmail.service.js";
import { deliverNotification, NotConfiguredPushProvider } from "../notifications/notifications.service.js";
import { reconcileFollowUpsForIncomingReply } from "../productivity/productivity.service.js";
import { getThreatAnalysesForUser } from "../security/threat-protection.service.js";
import { assertMailboxScopeConfigured, normalizeMailboxScope } from "./mailbox-scope.js";
import { writeAuditLog } from "../../lib/audit.js";

export type EmailFolder = "inbox" | "sent" | "drafts" | "starred" | "archive" | "trash" | "spam";
export type ListEmailFolder = EmailFolder | "snoozed";

export type EmailStatus =
  | "draft"
  | "pending_send"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";

export interface SendEmailDto {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachments?: EmailAttachment[];
  isDraft?: boolean;
  replyToId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  scheduledAt?: string | Date | null;
  undoDelaySeconds?: number;
  accountId?: string | null;
}

type SendExecutionOptions = { correlationId?: string; outboxWriter?: typeof insertEmailDispatchOutbox };

export interface ListEmailsQuery {
  folder?: ListEmailFolder;
  folderId?: string | null;
  search?: string | null;
  unreadOnly?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  hasAttachments?: boolean;
  label?: string | null;
  status?: EmailStatus | null;
  category?: EmailCategory | null;
  sizeMin?: number;
  sizeMax?: number;
  page?: number;
  limit?: number;
  cursor?: string | null;
  accountId?: string | null;
  organizationId?: string | null;
}

type EmailRow = typeof emailsTable.$inferSelect;

function formatEmail(email: typeof emailsTable.$inferSelect, threat: unknown = null) {
  return {
    id: email.id,
    subject: email.subject,

    from: {
      email: email.fromEmail,
      name: email.fromName ?? null,
    },

    to: (email.toAddresses as EmailAddress[]) ?? [],
    cc: (email.ccAddresses as EmailAddress[]) ?? [],
    bcc: (email.bccAddresses as EmailAddress[]) ?? [],

    bodyHtml: email.bodyHtml,
    bodyText: email.bodyText,

    folder: email.folder,
    customFolderId: email.customFolderId ?? null,

    isRead: email.isRead,
    isStarred: email.isStarred,
    isDraft: email.isDraft,

    attachments: (email.attachments as unknown[]) ?? [],

    threadId: email.threadId ?? null,
    replyToId: email.replyToId ?? null,
    messageId: email.messageId ?? null,
    inReplyTo: email.inReplyTo ?? null,
    references: (email.references as string[]) ?? [],

    labels: (email.labels as string[]) ?? [],
    category: normalizeEmailCategory(email.category),
    aiSummary: email.aiSummary ?? null,
    snoozedUntil: email.snoozedUntil?.toISOString() ?? null,
    status: email.status,
    scheduledAt: email.scheduledAt?.toISOString() ?? null,
    sendError: email.sendError ?? null,
    threat,

    createdAt: email.createdAt.toISOString(),
    sentAt: email.sentAt?.toISOString() ?? null,
  };
}

function toThreadCandidate(email: EmailRow): ThreadCandidate {
  return {
    id: email.id,
    subject: email.subject,
    threadId: email.threadId,
    replyToId: email.replyToId,
    fromEmail: email.fromEmail,
    toAddresses: email.toAddresses,
    isDraft: email.isDraft,
    createdAt: email.createdAt,
  };
}

async function findEmailForUser(userId: string, emailId: string) {
  const [email] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);

  return email ?? null;
}

async function getRecentThreadCandidates(userId: string): Promise<ThreadCandidate[]> {
  const rows = await db
    .select()
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .orderBy(desc(emailsTable.createdAt))
    .limit(200);

  return rows.map(toThreadCandidate);
}

async function resolveCanonicalThreadId(userId: string, email: EmailRow): Promise<string> {
  if (email.threadId && email.threadId !== email.id) {
    return email.threadId;
  }

  let replyToId = email.replyToId;
  const visited = new Set<string>([email.id]);

  for (let depth = 0; replyToId && depth < 50; depth += 1) {
    if (visited.has(replyToId)) {
      break;
    }

    visited.add(replyToId);

    const parent = await findEmailForUser(userId, replyToId);

    if (!parent) {
      break;
    }

    if (parent.threadId) {
      return parent.threadId;
    }

    replyToId = parent.replyToId;

    if (!replyToId) {
      return parent.id;
    }
  }

  return email.threadId ?? email.id;
}

async function loadLinkedThreadRows(userId: string, email: EmailRow): Promise<EmailRow[]> {
  const canonicalThreadId = await resolveCanonicalThreadId(userId, email);

  const initialRows = await db
    .select()
    .from(emailsTable)
    .where(
      and(
        eq(emailsTable.userId, userId),
        or(eq(emailsTable.threadId, canonicalThreadId), eq(emailsTable.id, canonicalThreadId))!,
      ),
    );

  const rowsById = new Map(initialRows.map((row) => [row.id, row]));
  rowsById.set(email.id, email);

  let frontierIds = Array.from(rowsById.keys());

  for (let depth = 0; frontierIds.length > 0 && depth < 50; depth += 1) {
    const childRows = await db
      .select()
      .from(emailsTable)
      .where(and(eq(emailsTable.userId, userId), inArray(emailsTable.replyToId, frontierIds)));

    frontierIds = [];

    for (const child of childRows) {
      if (!rowsById.has(child.id)) {
        rowsById.set(child.id, child);
        frontierIds.push(child.id);
      }
    }
  }

  const recentHeaderRows = await db
    .select()
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .orderBy(desc(emailsTable.createdAt))
    .limit(500);

  for (let pass = 0; pass < 10; pass += 1) {
    let added = false;
    for (const candidate of recentHeaderRows) {
      if (candidate.isDraft || rowsById.has(candidate.id)) continue;
      const candidateReferences = new Set((candidate.references as string[]) ?? []);
      const candidateMessageId = candidate.messageId;
      const linked = Array.from(rowsById.values()).some((row) => {
        const rowReferences = new Set((row.references as string[]) ?? []);
        return Boolean(
          (row.messageId && candidate.inReplyTo === row.messageId) ||
          (candidateMessageId && rowReferences.has(candidateMessageId)) ||
          (row.messageId && candidateReferences.has(row.messageId)),
        );
      });
      if (linked) {
        rowsById.set(candidate.id, candidate);
        added = true;
      }
    }
    if (!added) break;
  }

  if (rowsById.size === 1) {
    const recentRows = await db
      .select()
      .from(emailsTable)
      .where(eq(emailsTable.userId, userId))
      .orderBy(desc(emailsTable.createdAt))
      .limit(200);

    const normalizedSubject = normalizeThreadSubject(email.subject);
    const participantEmails = new Set(getThreadParticipantEmails(toThreadCandidate(email)));
    const legacyWindowMs = 7 * 24 * 60 * 60 * 1000;

    for (const candidate of recentRows) {
      if (
        candidate.id === email.id ||
        candidate.isDraft ||
        normalizeThreadSubject(candidate.subject) !== normalizedSubject ||
        Math.abs(candidate.createdAt.getTime() - email.createdAt.getTime()) > legacyWindowMs
      ) {
        continue;
      }

      const participantsOverlap = getThreadParticipantEmails(toThreadCandidate(candidate)).some(
        (address) => participantEmails.has(address),
      );

      if (
        participantsOverlap &&
        (isReplySubject(candidate.subject) || isReplySubject(email.subject))
      ) {
        rowsById.set(candidate.id, candidate);
      }
    }
  }

  return Array.from(rowsById.values()).sort(
    (first, second) => first.createdAt.getTime() - second.createdAt.getTime(),
  );
}

type ThreadContext = {
  threadId: string | null;
  replyToId: string | null;
};

async function resolveThreadContext(
  userId: string,
  options: {
    replyToId?: string | null;
    subject: string;
    participantEmails: string[];
    excludeId?: string;
  },
): Promise<ThreadContext> {
  if (options.replyToId) {
    const parentEmail = await findEmailForUser(userId, options.replyToId);

    if (parentEmail) {
      return {
        threadId: parentEmail.threadId ?? parentEmail.id,
        replyToId: parentEmail.id,
      };
    }
  }

  const fallbackParent = findSubjectThreadParent(await getRecentThreadCandidates(userId), {
    subject: options.subject,
    excludeId: options.excludeId,
    participantEmails: options.participantEmails,
  });

  if (!fallbackParent) {
    return {
      threadId: null,
      replyToId: null,
    };
  }

  const fallbackParentEmail = await findEmailForUser(userId, fallbackParent.id);

  return {
    threadId: fallbackParentEmail
      ? await resolveCanonicalThreadId(userId, fallbackParentEmail)
      : (fallbackParent.threadId ?? fallbackParent.id),
    replyToId: fallbackParent.id,
  };
}

async function findRecipientParentId(
  recipientUserId: string,
  threadId: string,
): Promise<string | null> {
  const [parent] = await db
    .select({
      id: emailsTable.id,
    })
    .from(emailsTable)
    .where(
      and(
        eq(emailsTable.userId, recipientUserId),
        eq(emailsTable.threadId, threadId),
        eq(emailsTable.isDraft, false),
      ),
    )
    .orderBy(desc(emailsTable.createdAt))
    .limit(1);

  return parent?.id ?? null;
}

function encodeEmailCursor(email: EmailRow): string {
  return Buffer.from(`${email.createdAt.toISOString()}|${email.id}`, "utf8").toString("base64url");
}

function decodeEmailCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  if (cursor.length > 256) throw Object.assign(new Error("Invalid cursor"), { statusCode: 400 });
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (separator <= 0 || !id || Number.isNaN(createdAt.getTime()) || id.length > 128) {
      throw new Error("invalid cursor");
    }
    return { createdAt, id };
  } catch {
    throw Object.assign(new Error("Invalid cursor"), { statusCode: 400 });
  }
}

async function resolveEmailAccountScope(userId: string, accountId: string | null | undefined): Promise<string | null | undefined> {
  if (accountId === undefined || accountId === "all") return undefined;
  if (accountId === null || accountId === "local") return null;
  const [account] = await db.select({ id: gmailConnectionsTable.id }).from(gmailConnectionsTable).where(and(eq(gmailConnectionsTable.id, accountId), eq(gmailConnectionsTable.userId, userId))).limit(1);
  if (!account) throw Object.assign(new Error("Account not found"), { statusCode: 404 });
  return account.id;
}

export async function listEmails(userId: string, query: ListEmailsQuery) {
  assertMailboxScopeConfigured(query.organizationId);
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(50, Math.max(1, query.limit ?? 20));
  const cursor = decodeEmailCursor(query.cursor);
  const offset = cursor ? 0 : (page - 1) * limit;

  const accountScope = await resolveEmailAccountScope(userId, query.accountId);
  const conditions = [eq(emailsTable.userId, userId)];
  if (accountScope !== undefined) conditions.push(accountScope === null ? isNull(emailsTable.accountId) : eq(emailsTable.accountId, accountScope));

  // Modified block: handle "starred" folder separately
  if (query.folder === "starred") {
    conditions.push(eq(emailsTable.isStarred, true));
  } else if (query.folder === "snoozed") {
    conditions.push(sql`${emailsTable.snoozedUntil} IS NOT NULL AND ${emailsTable.snoozedUntil} > NOW()`);
  } else if (query.folder) {
    conditions.push(eq(emailsTable.folder, query.folder));
  }

  if (query.folderId) {
    conditions.push(eq(emailsTable.customFolderId, query.folderId));
  }

  if (query.unreadOnly) {
    conditions.push(eq(emailsTable.isRead, false));
  }

  if (query.folder === "inbox") {
    conditions.push(or(sql`${emailsTable.snoozedUntil} IS NULL`, sql`${emailsTable.snoozedUntil} <= NOW()`)!);
  }

  if (query.search) {
    const normalizedSearch = query.search.trim();
    if (normalizedSearch.length > 200) {
      throw Object.assign(new Error("Search query is too long"), { statusCode: 400 });
    }
    if (normalizedSearch) {
      const searchTerm = `%${normalizedSearch}%`;
      conditions.push(
        or(
          sql`"search_document" @@ plainto_tsquery('simple'::regconfig, ${normalizedSearch})`,
          ilike(emailsTable.subject, searchTerm),
          ilike(emailsTable.fromEmail, searchTerm),
          ilike(sql`CAST(${emailsTable.toAddresses} AS text)`, searchTerm),
        )!,
      );
    }
  }

  if (query.dateFrom) {
    const dateFrom = new Date(query.dateFrom);
    if (Number.isNaN(dateFrom.getTime())) throw Object.assign(new Error("dateFrom must be a valid ISO date"), { statusCode: 400 });
    conditions.push(sql`${emailsTable.createdAt} >= ${dateFrom}`);
  }

  if (query.dateTo) {
    const dateTo = new Date(query.dateTo);
    if (Number.isNaN(dateTo.getTime())) throw Object.assign(new Error("dateTo must be a valid ISO date"), { statusCode: 400 });
    conditions.push(sql`${emailsTable.createdAt} <= ${dateTo}`);
  }

  if (query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) {
    throw Object.assign(new Error("dateFrom must be before dateTo"), { statusCode: 400 });
  }

  if (query.hasAttachments === true) {
    conditions.push(sql`jsonb_array_length(COALESCE(${emailsTable.attachments}, '[]'::jsonb)) > 0`);
  } else if (query.hasAttachments === false) {
    conditions.push(sql`jsonb_array_length(COALESCE(${emailsTable.attachments}, '[]'::jsonb)) = 0`);
  }

  if (query.label?.trim()) {
    conditions.push(sql`${emailsTable.labels} @> ${JSON.stringify([query.label.trim()])}::jsonb`);
  }

  if (query.status) {
    conditions.push(eq(emailsTable.status, query.status));
  }

  if (query.category) {
    if (!isEmailCategory(query.category)) {
      throw Object.assign(new Error("category must be one of the supported email categories"), { statusCode: 400 });
    }
    conditions.push(eq(emailsTable.category, query.category));
  }

  if (Number.isFinite(query.sizeMin)) {
    conditions.push(sql`COALESCE((SELECT SUM((item->>'size')::numeric) FROM jsonb_array_elements(COALESCE(${emailsTable.attachments}, '[]'::jsonb)) AS item), 0) >= ${query.sizeMin}`);
  }
  if (Number.isFinite(query.sizeMax)) {
    conditions.push(sql`COALESCE((SELECT SUM((item->>'size')::numeric) FROM jsonb_array_elements(COALESCE(${emailsTable.attachments}, '[]'::jsonb)) AS item), 0) <= ${query.sizeMax}`);
  }

  const baseWhereClause = and(...conditions);
  if (cursor) {
    conditions.push(sql`(${emailsTable.createdAt}, ${emailsTable.id}) < (${cursor.createdAt}, ${cursor.id})`);
  }
  const whereClause = and(...conditions);

  const [emailRows, [{ total }], [{ unreadCount }], categoryRows] = await Promise.all([
    db
      .select()
      .from(emailsTable)
      .where(whereClause)
      .orderBy(sql`${emailsTable.createdAt} DESC, ${emailsTable.id} DESC`)
      .limit(limit + 1)
      .offset(offset),

    db
      .select({
        total: count(),
      })
      .from(emailsTable)
      .where(baseWhereClause),

    db
      .select({
        unreadCount: count(),
      })
      .from(emailsTable)
      .where(and(eq(emailsTable.userId, userId), eq(emailsTable.isRead, false))),

    db
      .select({
        category: emailsTable.category,
        count: count(),
      })
      .from(emailsTable)
      .where(baseWhereClause)
      .groupBy(emailsTable.category),
  ]);

  const hasMore = emailRows.length > limit;
  const visibleRows = hasMore ? emailRows.slice(0, limit) : emailRows;
  const categoryCounts = Object.fromEntries(EMAIL_CATEGORIES.map((category) => [category, 0])) as Record<EmailCategory, number>;
  for (const row of categoryRows) categoryCounts[normalizeEmailCategory(row.category)] += Number(row.count);
  const threats = await getThreatAnalysesForUser(userId, visibleRows.map((row) => row.id));
  return {
    emails: visibleRows.map((row) => formatEmail(row, threats.get(row.id) ?? null)),
    total: Number(total),
    page,
    limit,
    nextCursor: hasMore && visibleRows.length > 0 ? encodeEmailCursor(visibleRows[visibleRows.length - 1]) : null,
    unreadCount: Number(unreadCount),
    categoryCounts,
  };
}

export type BulkSenderAction = "trash" | "archive" | "read" | "move";

export async function bulkSenderAction(userId: string, sender: string, action: BulkSenderAction, confirm: boolean, destination: "inbox" | "archive" | "spam" = "archive", organizationId?: string | null) {
  const scope = normalizeMailboxScope(organizationId);
  assertMailboxScopeConfigured(scope);
  const normalizedSender = sender.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedSender)) throw Object.assign(new Error("A valid sender address is required"), { statusCode: 400 });
  if (!['trash', 'archive', 'read', 'move'].includes(action)) throw Object.assign(new Error("Unsupported bulk sender action"), { statusCode: 400 });
  const matches = await db.select({ id: emailsTable.id }).from(emailsTable).where(and(eq(emailsTable.userId, userId), eq(emailsTable.fromEmail, normalizedSender), ne(emailsTable.folder, "trash")));
  if (!confirm) return { state: "CONFIRMATION_REQUIRED", action, affectedCount: matches.length, undoAvailable: action === "trash" || action === "archive" };
  if (matches.length === 0) {
    await writeAuditLog({ userId, organizationId: scope === "personal" ? null : scope, action: "email.bulk_sender_action", targetType: "sender_bulk", success: true, metadata: { action, affectedCount: 0, confirmed: true, reversible: action === "trash" || action === "archive" } });
    return { state: "COMPLETED", action, affectedCount: 0, undoAvailable: false };
  }
  const ids = matches.map((item) => item.id);
  const values = action === "trash" ? { folder: "trash" as const } : action === "archive" ? { folder: "archive" as const } : action === "move" ? { folder: destination } : { isRead: true };
  await db.update(emailsTable).set(values).where(and(eq(emailsTable.userId, userId), inArray(emailsTable.id, ids)));
  await writeAuditLog({ userId, organizationId: scope === "personal" ? null : scope, action: "email.bulk_sender_action", targetType: "sender_bulk", success: true, metadata: { action, affectedCount: ids.length, confirmed: true, reversible: action === "trash" || action === "archive" } });
  logger.info({ userId, action, affectedCount: ids.length }, "bulk sender action completed");
  return { state: "COMPLETED", action, affectedCount: ids.length, undoAvailable: action === "trash" || action === "archive" };
}

export async function getEmail(userId: string, emailId: string, organizationId?: string | null) {
  assertMailboxScopeConfigured(organizationId);
  const email = await findEmailForUser(userId, emailId);

  if (!email) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  const threadRows = await loadLinkedThreadRows(userId, email);
  const threats = await getThreatAnalysesForUser(userId, threadRows.map((row) => row.id));

  return {
    ...formatEmail(email, threats.get(email.id) ?? null),
    thread: threadRows.map((row) => formatEmail(row, threats.get(row.id) ?? null)),
  };
}

function configuredUndoDelaySeconds(requested?: number): number {
  if (requested !== undefined) {
    if (!Number.isInteger(requested) || requested < 5 || requested > 30) {
      throw Object.assign(new Error("undoDelaySeconds must be an integer between 5 and 30"), {
        statusCode: 400,
      });
    }
    return requested;
  }

  if (process.env.NODE_ENV === "test") return 0;
  const parsed = Number.parseInt(process.env.UNDO_SEND_DELAY_SECONDS ?? "8", 10);
  return Number.isInteger(parsed) ? Math.min(30, Math.max(5, parsed)) : 8;
}

function resolveScheduledAt(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    throw Object.assign(new Error("scheduledAt must be a valid future date"), { statusCode: 400 });
  }
  return parsed;
}

function messageHeaders(email: EmailRow): Record<string, string> {
  return {
    ...(email.messageId ? { "Message-ID": email.messageId } : {}),
    ...(email.inReplyTo ? { "In-Reply-To": email.inReplyTo } : {}),
    ...(((email.references as string[]) ?? []).length > 0
      ? { References: (email.references as string[]).join(" ") }
      : {}),
  };
}

export async function dispatchClaimedEmail(email: EmailRow, options: { markFailed?: boolean; signal?: AbortSignal } = {}): Promise<EmailRow> {
  const attachments = (email.attachments as EmailAttachment[] | null) ?? [];
  const attachmentBundle = await toOutboundAttachments(email.userId, attachments);
  const recipientEmails = (email.toAddresses as EmailAddress[]).map((recipient) => recipient.email);
  const ccEmails = ((email.ccAddresses as EmailAddress[] | null) ?? []).map((recipient) => recipient.email);
  const bccEmails = ((email.bccAddresses as EmailAddress[] | null) ?? []).map((recipient) => recipient.email);

  try {
    await getMailer().sendMessage({
      to: recipientEmails,
      cc: ccEmails,
      bcc: bccEmails,
      subject: email.subject,
      html: email.bodyHtml,
      text: email.bodyText,
      replyTo: email.fromEmail,
      headers: messageHeaders(email),
      attachments: attachmentBundle.outbound,
    }, options.signal);
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("SMTP delivery timeout; result may be unknown");

    const sentAt = new Date();
    const [updatedEmail] = await db
      .update(emailsTable)
      .set({
        status: "sent",
        isDraft: false,
        folder: "sent",
        scheduledAt: null,
        sentAt,
        sendError: null,
      })
      .where(and(eq(emailsTable.id, email.id), eq(emailsTable.status, "sending")))
      .returning();

        if (!updatedEmail) throw new Error("Delivery result unknown after provider accepted the message");
    const normalizedRecipients = recipientEmails.map((recipient) => recipient.trim().toLowerCase()).filter(Boolean);
    if (normalizedRecipients.length > 0) {
      try {
        const recipientUsers = await db
          .select()
          .from(usersTable)
          .where(or(...normalizedRecipients.map((recipient) => eq(usersTable.email, recipient)))!);
        for (const recipient of recipientUsers) {
          if (recipient.id === email.userId) continue;
          const recipientReplyToId = await findRecipientParentId(recipient.id, email.threadId ?? email.id);
          const [recipientEmail] = await db.insert(emailsTable).values({
            userId: recipient.id,
            accountId: null,
            subject: email.subject,
            fromEmail: email.fromEmail,
            fromName: email.fromName,
            toAddresses: email.toAddresses,
            ccAddresses: email.ccAddresses ?? [],
            bccAddresses: email.bccAddresses ?? [],
            bodyHtml: email.bodyHtml,
            bodyText: email.bodyText,
            attachments,
            folder: "inbox",
            isRead: false,
            isDraft: false,
            threadId: email.threadId ?? email.id,
            replyToId: recipientReplyToId,
            messageId: email.messageId,
            inReplyTo: email.inReplyTo,
            references: email.references ?? [],
            labels: email.labels ?? [],
            status: "sent",
            sentAt,
          }).returning({ id: emailsTable.id });
          if (recipientEmail) await reconcileFollowUpsForIncomingReply(recipient.id, recipientEmail.id);
        }
      } catch (fanoutError) {
        logger.warn({ emailId: email.id, error: sanitizeQueueError(fanoutError), status: "fanout_deferred" }, "Recipient mailbox fan-out failed after source delivery");
      }
    }
    const realtimeEvent = await publishUserEvent(email.userId, { event: "email.updated", data: { emailId: email.id, change: "updated" } });
    if (process.env.ENABLE_NOTIFICATIONS === "true" || process.env.ENABLE_NOTIFICATIONS === "1") {
      await deliverNotification(new NotConfiguredPushProvider(), { eventId: realtimeEvent.id, eventType: realtimeEvent.event, userId: email.userId, emailId: email.id, subject: email.subject, bodyPreview: email.bodyText });
    }
    return updatedEmail;

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed";
    if (options.markFailed !== false) {
      await db
        .update(emailsTable)
        .set({ status: "failed", sendError: message, scheduledAt: null })
        .where(and(eq(emailsTable.id, email.id), eq(emailsTable.status, "sending")));
    }
    throw error;
  }
}

export async function claimNextEmailForDelivery(): Promise<EmailRow | null> {
  const now = new Date();
  const result = await db.execute(sql`
    UPDATE emails
    SET status = 'sending'::email_status
    WHERE id = (
      SELECT id
      FROM emails
      WHERE status IN ('pending_send'::email_status, 'scheduled'::email_status)
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= ${now}
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  const claimedId = (result.rows[0] as { id?: string } | undefined)?.id;
  if (!claimedId) return null;
  const [claimed] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.id, claimedId), eq(emailsTable.status, "sending")))
    .limit(1);
  return claimed ?? null;
}

export async function cancelEmailSend(userId: string, emailId: string): Promise<ReturnType<typeof formatEmail>> {
  const [cancelled] = await db
    .update(emailsTable)
    .set({ status: "cancelled", scheduledAt: null, sendError: null })
    .where(
      and(
        eq(emailsTable.id, emailId),
        eq(emailsTable.userId, userId),
        or(eq(emailsTable.status, "pending_send"), eq(emailsTable.status, "scheduled"))!,
      ),
    )
    .returning();

  if (!cancelled) {
    throw Object.assign(new Error("Email is no longer waiting to be sent"), { statusCode: 409 });
  }
  return formatEmail(cancelled);
}

function parseFutureDate(value: unknown): Date {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw Object.assign(new Error("A future snooze time is required"), { statusCode: 400 });
  }
  return date;
}

export async function snoozeEmail(userId: string, emailId: string, until: unknown) {
  const date = parseFutureDate(until);
  const [updated] = await db
    .update(emailsTable)
    .set({ snoozedUntil: date })
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .returning();
  if (!updated) throw Object.assign(new Error("Email not found"), { statusCode: 404 });
  return formatEmail(updated);
}

export async function unsnoozeEmail(userId: string, emailId: string) {
  const [updated] = await db
    .update(emailsTable)
    .set({ snoozedUntil: null })
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .returning();
  if (!updated) throw Object.assign(new Error("Email not found"), { statusCode: 404 });
  return formatEmail(updated);
}

export async function sendEmail(userId: string, dto: SendEmailDto, options: SendExecutionOptions = {}) {
  const accountScope = await resolveEmailAccountScope(userId, dto.accountId);
  const [user] = await db
    .select({
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    throw Object.assign(new Error("User not found"), {
      statusCode: 404,
    });
  }

  const fromEmail = user.email;
  const fromName = `${user.firstName} ${user.lastName}`;
  const attachmentBundle = {
    canonical: await normalizeAttachmentsForUser(userId, dto.attachments),
  };

  const folder: EmailFolder = dto.isDraft ? "drafts" : "sent";
  const requestedScheduledAt = resolveScheduledAt(dto.scheduledAt);
  const undoDelaySeconds = dto.isDraft || requestedScheduledAt ? 0 : configuredUndoDelaySeconds(dto.undoDelaySeconds);
  const scheduledAt = dto.isDraft
    ? null
    : requestedScheduledAt ?? new Date(Date.now() + undoDelaySeconds * 1000);
  const status: EmailStatus = dto.isDraft ? "draft" : requestedScheduledAt ? "scheduled" : "pending_send";
  const sentAt = null;

  const threadContext = await resolveThreadContext(userId, {
    replyToId: dto.replyToId,
    subject: dto.subject,
    participantEmails: [fromEmail, ...dto.to.map((recipient) => recipient.email)],
  });
  const emailId = randomUUID();
  const effectiveThreadId = threadContext.threadId ?? emailId;
  const messageId = `<${emailId}@${fromEmail.split("@")[1] || "zephyx.local"}>`;
  const references = dto.references ?? (dto.inReplyTo ? [dto.inReplyTo] : []);

  const scheduled = !dto.isDraft && (Boolean(requestedScheduledAt) || undoDelaySeconds > 0);
  const transactionResult = await db.transaction(async (tx) => {
    const [createdEmail] = await tx
      .insert(emailsTable)
      .values({
        id: emailId,
        userId,
        accountId: accountScope ?? null,
        subject: dto.subject,
        fromEmail,
        fromName,
        toAddresses: dto.to,
        ccAddresses: dto.cc ?? [],
        bccAddresses: dto.bcc ?? [],
        bodyHtml: dto.bodyHtml,
        bodyText: dto.bodyText ?? dto.bodyHtml.replace(/<[^>]+>/g, ""),
        attachments: attachmentBundle.canonical,
        folder,
        isRead: true,
        isDraft: dto.isDraft ?? false,
        threadId: effectiveThreadId,
        replyToId: threadContext.replyToId,
        messageId,
        inReplyTo: dto.inReplyTo ?? null,
        references,
        status,
        scheduledAt,
        sentAt,
      })
      .returning();
    if (!createdEmail) throw Object.assign(new Error("Failed to create email"), { statusCode: 500 });
    const outbox = scheduled
      ? await (options.outboxWriter ?? insertEmailDispatchOutbox)(tx, { emailId: createdEmail.id, availableAt: scheduledAt ?? new Date(), correlationId: options.correlationId ?? createdEmail.id })
      : null;
    return { email: createdEmail, outbox };
  });
  const email = transactionResult.email;
  const outbox = transactionResult.outbox;
  if (outbox && outbox.availableAt <= new Date() && process.env.REDIS_URL) {
    await publishOutboxJob(outbox).catch(() => undefined);
  }
  if (!dto.isDraft && !requestedScheduledAt && undoDelaySeconds === 0) {

    const [claimed] = await db
      .update(emailsTable)
      .set({ status: "sending" })
      .where(and(eq(emailsTable.id, email.id), eq(emailsTable.status, "pending_send")))
      .returning();
    if (claimed) {
      const delivered = await dispatchClaimedEmail(claimed);
      return formatEmail(delivered);
    }
  }

  return formatEmail({ ...email, threadId: effectiveThreadId });
}

export async function updateDraft(
  userId: string,
  emailId: string,
  dto: SendEmailDto,
  sendNow = false,
  options: SendExecutionOptions = {},
) {
  const [currentDraft] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);

  if (!currentDraft) {
    throw Object.assign(new Error("Draft not found"), {
      statusCode: 404,
    });
  }

  if (!currentDraft.isDraft || currentDraft.folder !== "drafts") {
    throw Object.assign(new Error("Only draft emails can be updated"), {
      statusCode: 400,
    });
  }

  const recipients = dto.to ?? [];

  if (sendNow && recipients.length === 0) {
    throw Object.assign(new Error("At least one recipient is required"), {
      statusCode: 400,
    });
  }

  const bodyHtml = dto.bodyHtml ?? "";
  const bodyText = dto.bodyText ?? bodyHtml.replace(/<[^>]+>/g, "");
  const requestedAttachments =
    dto.attachments ?? (currentDraft.attachments as EmailAttachment[] | null) ?? [];
  const attachments = await normalizeAttachmentsForUser(userId, requestedAttachments);

  const requestedReplyToId = dto.replyToId ?? currentDraft.replyToId ?? null;
  const threadContext = await resolveThreadContext(userId, {
    replyToId: requestedReplyToId,
    subject: dto.subject ?? currentDraft.subject,
    participantEmails: [currentDraft.fromEmail, ...recipients.map((recipient) => recipient.email)],
    excludeId: currentDraft.id,
  });
  const effectiveThreadId = threadContext.threadId ?? currentDraft.threadId ?? currentDraft.id;
  const replyToId = threadContext.replyToId ?? requestedReplyToId;
  const requestedScheduledAt = sendNow ? resolveScheduledAt(dto.scheduledAt) : null;
  const undoDelaySeconds = sendNow && !requestedScheduledAt ? configuredUndoDelaySeconds(dto.undoDelaySeconds) : 0;
  const scheduledAt = sendNow
    ? requestedScheduledAt ?? new Date(Date.now() + undoDelaySeconds * 1000)
    : null;
  const status: EmailStatus = !sendNow ? "draft" : requestedScheduledAt ? "scheduled" : "pending_send";
  const messageId = currentDraft.messageId ?? `<${currentDraft.id}@${currentDraft.fromEmail.split("@")[1] || "zephyx.local"}>`;
  const references = dto.references ?? (dto.inReplyTo ? [dto.inReplyTo] : (currentDraft.references as string[]) ?? []);

  const scheduled = sendNow && (Boolean(requestedScheduledAt) || undoDelaySeconds > 0);
  const transactionResult = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(emailsTable)
      .set({
        subject: dto.subject ?? "",
        toAddresses: recipients,
        ccAddresses: dto.cc ?? [],
        bccAddresses: dto.bcc ?? [],
        bodyHtml,
        bodyText,
        attachments,
        folder: sendNow ? "sent" : "drafts",
        customFolderId: null,
        isRead: true,
        isDraft: !sendNow,
        threadId: effectiveThreadId,
        replyToId,
        messageId,
        inReplyTo: dto.inReplyTo ?? currentDraft.inReplyTo ?? null,
        references,
        status,
        scheduledAt,
        sendError: null,
        sentAt: null,
      })
      .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId), eq(emailsTable.isDraft, true)))
      .returning();
    if (!updated) throw Object.assign(new Error("Failed to update draft"), { statusCode: 500 });
    const outbox = scheduled
      ? await (options.outboxWriter ?? insertEmailDispatchOutbox)(tx, { emailId: updated.id, availableAt: scheduledAt ?? new Date(), correlationId: options.correlationId ?? updated.id })
      : null;
    return { email: updated, outbox };
  });

  let resultEmail = transactionResult.email;
  if (transactionResult.outbox && transactionResult.outbox.availableAt <= new Date() && process.env.REDIS_URL) {
    await publishOutboxJob(transactionResult.outbox).catch(() => undefined);
  }
  if (sendNow && !requestedScheduledAt && undoDelaySeconds === 0) {
    const [claimed] = await db
      .update(emailsTable)
      .set({ status: "sending" })
      .where(and(eq(emailsTable.id, transactionResult.email.id), eq(emailsTable.status, "pending_send")))
      .returning();
    if (claimed) resultEmail = await dispatchClaimedEmail(claimed);
  }

  await cleanupAttachmentCandidates(
    removedAttachments(
      currentDraft.attachments as EmailAttachment[] | null,
      attachments,
    ),
  );

  return formatEmail({ ...resultEmail, threadId: effectiveThreadId });
}

export async function trashEmail(userId: string, emailId: string) {
  const [email] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);

  if (!email) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  if (email.folder === "trash") {
    await db
      .delete(emailsTable)
      .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)));

    await cleanupAttachmentCandidates(email.attachments as EmailAttachment[] | null);
    return;
  }

  // Gmail messages must be moved remotely before updating NovaMail.
  if (email.gmailMessageId) {
    await trashGmailMessage(userId, email.gmailMessageId);
  }

  await db
    .update(emailsTable)
    .set({
      folder: "trash",
      customFolderId: null,
    })
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)));
}

export async function deleteEmailPermanent(userId: string, emailId: string) {
  const email = await findEmailForUser(userId, emailId);

  if (!email) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  const result = await db
    .delete(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)));

  await cleanupAttachmentCandidates(email.attachments as EmailAttachment[] | null);
  return result;
}

export async function markEmailRead(userId: string, emailId: string, isRead: boolean) {
  const [current] = await db
    .select({
      gmailMessageId: emailsTable.gmailMessageId,
    })
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);

  if (!current) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  // Keep Gmail and NovaMail consistent in the NovaMail -> Gmail direction.
  if (current.gmailMessageId) {
    await modifyGmailMessageLabels(
      userId,
      current.gmailMessageId,
      isRead ? [] : ["UNREAD"],
      isRead ? ["UNREAD"] : [],
    );
  }

  const [email] = await db
    .update(emailsTable)
    .set({
      isRead,
    })
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .returning();

  if (!email) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  return formatEmail(email);
}

export async function toggleEmailStar(userId: string, emailId: string, desiredIsStarred?: boolean) {
  const [current] = await db
    .select({
      isStarred: emailsTable.isStarred,
      gmailMessageId: emailsTable.gmailMessageId,
    })
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);

  if (!current) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  const nextIsStarred = desiredIsStarred ?? !current.isStarred;

  // Keep Gmail in sync before changing NovaMail.
  if (current.gmailMessageId) {
    await modifyGmailMessageLabels(
      userId,
      current.gmailMessageId,
      nextIsStarred ? ["STARRED"] : [],
      nextIsStarred ? [] : ["STARRED"],
    );
  }

  const [email] = await db
    .update(emailsTable)
    .set({
      isStarred: nextIsStarred,
    })
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .returning();

  if (!email) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  return formatEmail(email);
}

export async function moveEmail(
  userId: string,
  emailId: string,
  folder: EmailFolder,
  targetCustomFolderId?: string | null,
) {
  const current = await findEmailForUser(userId, emailId);

  if (!current) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  const nextCustomFolderId = targetCustomFolderId ?? null;

  // A user must never be able to attach their email to another
  // user's custom folder by guessing or supplying its ID.
  if (nextCustomFolderId) {
    const [ownedFolder] = await db
      .select({ id: foldersTable.id })
      .from(foldersTable)
      .where(
        and(
          eq(foldersTable.id, nextCustomFolderId),
          eq(foldersTable.userId, userId),
        ),
      )
      .limit(1);

    if (!ownedFolder) {
      throw Object.assign(new Error("Folder not found"), {
        statusCode: 404,
      });
    }
  }

  if (current.gmailMessageId) {
    if (folder === "trash") {
      await trashGmailMessage(userId, current.gmailMessageId);
    } else {
      if (current.folder === "trash") {
        await untrashGmailMessage(userId, current.gmailMessageId);
      }

      if (folder === "archive") {
        await modifyGmailMessageLabels(
          userId,
          current.gmailMessageId,
          [],
          ["INBOX", "SPAM"],
        );
      } else if (folder === "inbox") {
        await modifyGmailMessageLabels(
          userId,
          current.gmailMessageId,
          ["INBOX"],
          ["SPAM", "TRASH"],
        );
      } else if (folder === "spam") {
        await modifyGmailMessageLabels(
          userId,
          current.gmailMessageId,
          ["SPAM"],
          ["INBOX", "TRASH"],
        );
      }
    }
  }

  const currentLabels = new Set((current.labels as string[] | null) ?? []);

  if (folder === "archive") {
    currentLabels.delete("INBOX");
    currentLabels.delete("SPAM");
    currentLabels.delete("TRASH");
  } else if (folder === "inbox") {
    currentLabels.add("INBOX");
    currentLabels.delete("SPAM");
    currentLabels.delete("TRASH");
  } else if (folder === "trash") {
    currentLabels.delete("INBOX");
    currentLabels.delete("SPAM");
    currentLabels.add("TRASH");
  } else if (folder === "spam") {
    currentLabels.delete("INBOX");
    currentLabels.delete("TRASH");
    currentLabels.add("SPAM");
  }

  const [email] = await db
    .update(emailsTable)
    .set({
      folder,
      labels: Array.from(currentLabels),
      customFolderId: nextCustomFolderId,
    })
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .returning();

  if (!email) {
    throw Object.assign(new Error("Email not found"), {
      statusCode: 404,
    });
  }

  return formatEmail(email);
}
