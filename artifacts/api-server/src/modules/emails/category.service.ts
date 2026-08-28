import { and, count, desc, eq } from "drizzle-orm";
import {
  db,
  emailCategoryFeedbackTable,
  emailsTable,
  EMAIL_CATEGORIES,
  type EmailCategory,
} from "@workspace/db";
import { getOrganizationAccess } from "../enterprise/enterprise.service.js";
import { writeAuditLog } from "../../lib/audit.js";

export type CategoryClassificationMethod = "manual_feedback" | "scoped_sender_feedback" | "deterministic_rule";
export type CategoryReason = { code: string; label: string; source: "manual" | "scoped_feedback" | "rule" };

const LEGACY_CATEGORY_MAP: Record<string, EmailCategory> = {
  promotional: "promotions",
  updates: "primary",
};

const CATEGORY_RULES: Array<{
  category: EmailCategory;
  code: string;
  label: string;
  pattern: RegExp;
}> = [
  { category: "security", code: "security_signal", label: "Security or account-protection language", pattern: /\b(security|verify|verification|password|sign[- ]?in|login|suspicious|breach|2fa|mfa|account alert|حماية|أمان|تحقق|تسجيل الدخول|كلمة المرور|تنبيه أمني)\b/i },
  { category: "spam", code: "spam_signal", label: "Spam-like or unsolicited language", pattern: /\b(viagra|casino|lottery|winner|prize|free money|earn cash|click now|urgent offer|يانصيب|جائزة|اربح|اضغط الآن)\b/i },
  { category: "orders", code: "order_signal", label: "Order, shipment, or delivery language", pattern: /\b(order|ordered|shipment|shipped|tracking|delivery|delivered|purchase confirmation|tracking number|طلب|شحنة|شحن|توصيل|تم التسليم|رقم التتبع)\b/i },
  { category: "travel", code: "travel_signal", label: "Travel reservation or itinerary language", pattern: /\b(flight|boarding|airport|hotel|reservation|booking|itinerary|trip|airline|رحلة|طيران|مطار|فندق|حجز|خط سير)\b/i },
  { category: "bills", code: "bill_signal", label: "Bill or payment-due language", pattern: /\b(bill|utility|due date|past due|statement|payment due|فاتورة|استحقاق|موعد الدفع|كشف حساب)\b/i },
  { category: "finance", code: "finance_signal", label: "Financial, banking, or transaction language", pattern: /\b(bank|banking|transaction|transfer|payment|invoice|receipt|refund|tax|finance|financial|بنك|تحويل|دفع|إيصال|استرداد|ضريبة|مالي)\b/i },
  { category: "events", code: "event_signal", label: "Event, meeting, or appointment language", pattern: /\b(meeting|appointment|calendar|invite|invitation|webinar|conference|event|اجتماع|موعد|تقويم|دعوة|ندوة|مؤتمر|فعالية)\b/i },
  { category: "newsletters", code: "newsletter_signal", label: "Newsletter or mailing-list language", pattern: /\b(newsletter|digest|weekly update|mailing list|unsubscribe|list-unsubscribe|النشرة|ملخص أسبوعي|إلغاء الاشتراك)\b/i },
  { category: "promotions", code: "promotion_signal", label: "Promotion, sale, or discount language", pattern: /\b(sale|discount|coupon|offer|deal|promo|promotion|limited time|خصم|عرض|تخفيض|ترويجي)\b/i },
  { category: "social", code: "social_signal", label: "Social network or community language", pattern: /\b(facebook|instagram|linkedin|twitter|social|community|friend request|فيسبوك|إنستغرام|لينكدإن|مجتمع|طلب صداقة)\b/i },
  { category: "work", code: "work_signal", label: "Work, project, or client language", pattern: /\b(project|client|proposal|contract|invoice approval|milestone|sprint|workstream|مشروع|عميل|عرض|عقد|مرحلة|عمل)\b/i },
];

export function isEmailCategory(value: unknown): value is EmailCategory {
  return typeof value === "string" && (EMAIL_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeEmailCategory(value: unknown): EmailCategory {
  if (isEmailCategory(value)) return value;
  if (typeof value === "string" && LEGACY_CATEGORY_MAP[value]) return LEGACY_CATEGORY_MAP[value];
  return "primary";
}

export function classifyLocalEmail(subject: string, bodyText: string, sender: string): { category: EmailCategory; confidence: number; reasons: CategoryReason[] } {
  const haystack = `${subject}\n${bodyText}\n${sender}`.slice(0, 20_000);
  const matched = CATEGORY_RULES.find((rule) => rule.pattern.test(haystack));
  if (!matched) {
    return {
      category: "primary",
      confidence: 0.55,
      reasons: [{ code: "default_primary", label: "No stronger category signal was found", source: "rule" }],
    };
  }
  return {
    category: matched.category,
    confidence: 0.78,
    reasons: [{ code: matched.code, label: matched.label, source: "rule" }],
  };
}

async function getOrganizationScope(userId: string, organizationId?: string | null): Promise<string> {
  const scope = organizationId?.trim() || "personal";
  if (scope !== "personal") await getOrganizationAccess(userId, scope);
  return scope;
}

async function findOwnedEmail(userId: string, emailId: string) {
  const [email] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
    .limit(1);
  if (!email) throw Object.assign(new Error("Email not found"), { statusCode: 404 });
  return email;
}

export async function classifyEmailCategory(
  userId: string,
  emailId: string,
  organizationId?: string | null,
): Promise<{
  category: EmailCategory;
  confidence: number;
  method: CategoryClassificationMethod;
  reasons: CategoryReason[];
  providerState: "NOT_CONFIGURED";
  organizationId: string;
}> {
  const email = await findOwnedEmail(userId, emailId);
  const scope = await getOrganizationScope(userId, organizationId);

  const [directFeedback] = await db
    .select({ category: emailCategoryFeedbackTable.category })
    .from(emailCategoryFeedbackTable)
    .where(
      and(
        eq(emailCategoryFeedbackTable.emailId, emailId),
        eq(emailCategoryFeedbackTable.userId, userId),
        eq(emailCategoryFeedbackTable.organizationId, scope),
      ),
    )
    .limit(1);

  if (directFeedback) {
    return {
      category: normalizeEmailCategory(directFeedback.category),
      confidence: 1,
      method: "manual_feedback",
      reasons: [{ code: "manual_feedback", label: "Applied your saved category correction", source: "manual" }],
      providerState: "NOT_CONFIGURED",
      organizationId: scope,
    };
  }

  const [senderFeedback] = await db
    .select({ category: emailCategoryFeedbackTable.category })
    .from(emailCategoryFeedbackTable)
    .innerJoin(emailsTable, eq(emailsTable.id, emailCategoryFeedbackTable.emailId))
    .where(
      and(
        eq(emailCategoryFeedbackTable.userId, userId),
        eq(emailCategoryFeedbackTable.organizationId, scope),
        eq(emailsTable.fromEmail, email.fromEmail),
      ),
    )
    .orderBy(desc(emailCategoryFeedbackTable.updatedAt))
    .limit(1);

  if (senderFeedback) {
    return {
      category: normalizeEmailCategory(senderFeedback.category),
      confidence: 0.9,
      method: "scoped_sender_feedback",
      reasons: [{ code: "scoped_sender_feedback", label: "Applied a correction previously saved for this sender in the same scope", source: "scoped_feedback" }],
      providerState: "NOT_CONFIGURED",
      organizationId: scope,
    };
  }

  const local = classifyLocalEmail(email.subject, email.bodyText, email.fromEmail);
  return { ...local, method: "deterministic_rule", providerState: "NOT_CONFIGURED", organizationId: scope };
}

export async function applyEmailCategoryCorrection(
  userId: string,
  emailId: string,
  category: EmailCategory,
  organizationId?: string | null,
) {
  const email = await findOwnedEmail(userId, emailId);
  const scope = await getOrganizationScope(userId, organizationId);
  await db
    .insert(emailCategoryFeedbackTable)
    .values({ emailId, userId, organizationId: scope, category, source: "manual" })
    .onConflictDoUpdate({
      target: [emailCategoryFeedbackTable.emailId, emailCategoryFeedbackTable.organizationId, emailCategoryFeedbackTable.userId],
      set: { category, source: "manual", updatedAt: new Date() },
    });
  let updated = email;
  if (scope === "personal") {
    const [personalUpdated] = await db
      .update(emailsTable)
      .set({ category })
      .where(and(eq(emailsTable.id, emailId), eq(emailsTable.userId, userId)))
      .returning();
    if (personalUpdated) updated = personalUpdated;
  }
  await writeAuditLog({
    userId,
    organizationId: scope === "personal" ? null : scope,
    action: "email.category_corrected",
    targetType: "email",
    targetId: emailId,
    metadata: { category, source: "manual" },
  });
  return {
    emailId: updated.id,
    category,
    organizationId: scope,
    method: "manual_feedback" as const,
    providerState: "NOT_CONFIGURED" as const,
    sender: email.fromEmail,
    scopeIsolation: scope === "personal" ? "PERSONAL_GLOBAL_CATEGORY" : "ORGANIZATION_FEEDBACK_OVERLAY",
  };
}

export async function getEmailCategorySummary(userId: string, organizationId?: string | null) {
  const scope = await getOrganizationScope(userId, organizationId);
  const counts = Object.fromEntries(EMAIL_CATEGORIES.map((category) => [category, 0])) as Record<EmailCategory, number>;

  if (scope !== "personal") {
    return {
      categories: EMAIL_CATEGORIES,
      counts,
      organizationId: scope,
      scopeIsolation: "NOT_CONFIGURED" as const,
      reason: "emails are currently user-scoped; organization mailbox counts are not exposed until emails have an organization mapping",
      classification: { method: "deterministic_rules", providerState: "NOT_CONFIGURED" as const },
    };
  }

  const rows = await db
    .select({ category: emailsTable.category, count: count() })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .groupBy(emailsTable.category);
  for (const row of rows) counts[normalizeEmailCategory(row.category)] += Number(row.count);
  return {
    categories: EMAIL_CATEGORIES,
    counts,
    organizationId: scope,
    scopeIsolation: "PERSONAL_GLOBAL_CATEGORY" as const,
    classification: { method: "deterministic_rules", providerState: "NOT_CONFIGURED" as const },
  };
}
