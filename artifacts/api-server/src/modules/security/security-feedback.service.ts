import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  auditLogsTable,
  db,
  emailSecurityFeedbackTable,
  emailsTable,
  type SecurityFeedbackType,
} from "@workspace/db";
import { getOrganizationAccess } from "../enterprise/enterprise.service.js";

const allowedFeedback = new Set<SecurityFeedbackType>(["spam", "not_spam", "phishing", "not_phishing"]);

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

async function assertAccess(userId: string, emailId: string, organizationId: string) {
  const [email] = await db.select({ id: emailsTable.id }).from(emailsTable).where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId))).limit(1);
  if (!email) fail("Email not found", 404);
  if (organizationId !== "personal") await getOrganizationAccess(userId, organizationId);
}

export async function submitSecurityFeedback(userId: string, emailId: string, organizationId: string, feedbackType: SecurityFeedbackType) {
  if (!allowedFeedback.has(feedbackType)) fail("Invalid security feedback type", 400);
  await assertAccess(userId, emailId, organizationId);
  const now = new Date();
  const [row] = await db.insert(emailSecurityFeedbackTable).values({
    id: randomUUID(), emailId, userId, organizationId, feedbackType, createdAt: now, updatedAt: now,
  }).onConflictDoUpdate({
    target: [emailSecurityFeedbackTable.emailId, emailSecurityFeedbackTable.organizationId, emailSecurityFeedbackTable.userId],
    set: { feedbackType, updatedAt: now },
  }).returning();
  if (!row) throw new Error("Security feedback could not be persisted");
  await db.insert(auditLogsTable).values({
    id: randomUUID(), userId, organizationId: organizationId === "personal" ? null : organizationId,
    action: "security.feedback.submitted", targetType: "email", targetId: emailId, success: true,
    metadata: { feedbackType, learningScope: organizationId === "personal" ? "user" : "organization" },
  });
  return { id: row.id, emailId: row.emailId, organizationId: row.organizationId, feedbackType: row.feedbackType, learningScope: organizationId === "personal" ? "user" as const : "organization" as const, updatedAt: row.updatedAt.toISOString() };
}

export async function getSecurityFeedback(userId: string, emailId: string, organizationId: string) {
  await assertAccess(userId, emailId, organizationId);
  const [row] = await db.select().from(emailSecurityFeedbackTable).where(and(eq(emailSecurityFeedbackTable.userId, userId), eq(emailSecurityFeedbackTable.emailId, emailId), eq(emailSecurityFeedbackTable.organizationId, organizationId))).limit(1);
  return row ? { id: row.id, emailId: row.emailId, organizationId: row.organizationId, feedbackType: row.feedbackType, learningScope: organizationId === "personal" ? "user" as const : "organization" as const, updatedAt: row.updatedAt.toISOString() } : null;
}

export async function getFeedbackCountsForOrganization(userId: string, organizationId: string) {
  await getOrganizationAccess(userId, organizationId);
  const rows = await db.select({ feedbackType: emailSecurityFeedbackTable.feedbackType }).from(emailSecurityFeedbackTable).where(eq(emailSecurityFeedbackTable.organizationId, organizationId));
  return {
    spam: rows.filter((row) => row.feedbackType === "spam").length,
    notSpam: rows.filter((row) => row.feedbackType === "not_spam").length,
    phishing: rows.filter((row) => row.feedbackType === "phishing").length,
    notPhishing: rows.filter((row) => row.feedbackType === "not_phishing").length,
  };
}
