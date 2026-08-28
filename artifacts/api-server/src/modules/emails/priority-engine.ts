export type PriorityEmail = {
  subject: string;
  bodyText: string;
  category?: string | null;
  isStarred: boolean;
  isRead: boolean;
  folder: string;
  toAddresses?: Array<{ email: string; name?: string | null }>;
  threat?: unknown;
};

export type PriorityResult = {
  priority: "high" | "normal" | "low";
  score: number;
  reasons: string[];
  state: "READY";
  providerState: "NOT_CONFIGURED";
};

export function derivePriority(email: PriorityEmail): PriorityResult {
  const text = `${email.subject}\n${email.bodyText}`.slice(0, 20_000);
  let score = 50;
  const reasons: string[] = [];
  if (email.isStarred) { score += 18; reasons.push("Starred by the user"); }
  if (!email.isRead) { score += 8; reasons.push("Unread message"); }
  if (/\b(urgent|asap|deadline|due today|action required|عاجل|موعد نهائي|إجراء مطلوب)\b/i.test(text)) { score += 18; reasons.push("Urgency language detected"); }
  if (/\b(replied|reply|follow[- ]?up|رد|متابعة)\b/i.test(text)) { score += 8; reasons.push("Reply or follow-up signal detected"); }
  if (email.category === "security" || email.category === "work") { score += 6; reasons.push(`Category signal: ${email.category}`); }
  if (email.category === "promotions" || email.category === "social" || email.category === "newsletters") { score -= 15; reasons.push(`Lower priority category: ${email.category}`); }
  const threat = email.threat && typeof email.threat === "object" ? email.threat as { overallRisk?: unknown; malwareStatus?: unknown } : null;
  if (threat?.overallRisk === "high" || threat?.malwareStatus === "blocked") { score += 25; reasons.push("Stored security finding requires review"); }
  score = Math.max(0, Math.min(100, score));
  const priority = score >= 70 ? "high" : score <= 35 ? "low" : "normal";
  if (reasons.length === 0) reasons.push("No stronger local priority signal detected");
  return { priority, score, reasons, state: "READY", providerState: "NOT_CONFIGURED" };
}
