export const CANONICAL_EMAIL_CATEGORIES = [
  "primary",
  "work",
  "social",
  "promotions",
  "newsletters",
  "orders",
  "travel",
  "finance",
  "bills",
  "events",
  "security",
  "spam",
] as const;

export type CanonicalEmailCategory = (typeof CANONICAL_EMAIL_CATEGORIES)[number];
export type CategoryClassificationMethod = "manual_feedback" | "scoped_sender_feedback" | "deterministic_rule";
export type CategoryReason = { code: string; label: string; source: "manual" | "scoped_feedback" | "rule" };

const LEGACY_CATEGORY_MAP: Record<string, CanonicalEmailCategory> = {
  promotional: "promotions",
  updates: "primary",
};

const CATEGORY_RULES: Array<{
  category: CanonicalEmailCategory;
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

export function isCanonicalEmailCategory(value: unknown): value is CanonicalEmailCategory {
  return typeof value === "string" && (CANONICAL_EMAIL_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeLegacyEmailCategory(value: unknown): CanonicalEmailCategory {
  if (isCanonicalEmailCategory(value)) return value;
  if (typeof value === "string" && LEGACY_CATEGORY_MAP[value]) return LEGACY_CATEGORY_MAP[value];
  return "primary";
}

export function classifyLocalEmail(subject: string, bodyText: string, sender: string): { category: CanonicalEmailCategory; confidence: number; reasons: CategoryReason[] } {
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
