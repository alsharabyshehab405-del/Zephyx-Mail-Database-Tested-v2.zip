export type ActionType =
  | "read"
  | "reply"
  | "summarize"
  | "pay"
  | "track"
  | "attend"
  | "add_to_planner"
  | "add_to_calendar"
  | "review"
  | "secure"
  | "report"
  | "quarantine"
  | "ignore";

export type EmailAction = {
  type: ActionType;
  reason: string;
  sourceSignal: string;
  confidence: number;
  permissionsRequired: string[];
  requiresConfirmation: true;
};

type ActionEmail = {
  subject: string;
  bodyText: string;
  folder: string;
  isRead: boolean;
  threat?: unknown;
};

function action(type: ActionType, reason: string, sourceSignal: string, confidence: number, permissionsRequired: string[] = ["email:read"]): EmailAction {
  return { type, reason, sourceSignal, confidence, permissionsRequired, requiresConfirmation: true };
}

export function deriveEmailActions(email: ActionEmail): EmailAction[] {
  const text = `${email.subject}\n${email.bodyText}`.slice(0, 20_000);
  const actions: EmailAction[] = [action("read", email.isRead ? "Review this message again" : "Message is unread", "unread_state", email.isRead ? 0.7 : 0.98)];
  if (email.folder !== "sent" && email.folder !== "trash") actions.push(action("reply", "A reply may be appropriate", "inbound_message", 0.62, ["email:read", "email:compose"]));
  if (text.length > 1_500) actions.push(action("summarize", "The message is long enough to benefit from a summary", "message_length", 0.86));
  if (/\b(meeting|appointment|calendar|invite|webinar|conference|اجتماع|موعد|تقويم|دعوة)\b/i.test(text)) {
    actions.push(action("attend", "Meeting or event language was detected", "event_signal", 0.82));
    actions.push(action("add_to_planner", "Event details can be reviewed before saving", "event_signal", 0.78, ["email:read", "planner:write"]));
    actions.push(action("add_to_calendar", "Calendar entry requires explicit user confirmation", "event_signal", 0.75, ["email:read", "calendar:write"]));
  }
  if (/\b(invoice|bill|payment due|receipt|فاتورة|دفع|استحقاق|إيصال)\b/i.test(text)) {
    actions.push(action("pay", "Payment or bill language was detected; no payment is performed automatically", "finance_signal", 0.8, ["email:read"]));
    actions.push(action("review", "Financial details should be reviewed from the message", "finance_signal", 0.78));
  }
  if (/\b(order|tracking|shipment|delivery|delivered|طلب|تتبع|شحنة|توصيل)\b/i.test(text)) {
    actions.push(action("track", "Order or delivery language was detected; carrier data is not queried", "order_signal", 0.82));
  }
  const threat = email.threat && typeof email.threat === "object" ? email.threat as { overallRisk?: unknown; malwareStatus?: unknown } : null;
  const dangerous = threat?.overallRisk === "high" || threat?.malwareStatus === "blocked";
  if (dangerous) {
    actions.push(action("secure", "Stored threat findings require review", "stored_security_finding", 0.98, ["email:read", "security:read"]));
    actions.push(action("report", "The message can be reported after user confirmation", "stored_security_finding", 0.9, ["email:read", "security:write"]));
    actions.push(action("quarantine", "Quarantine is available only under existing RBAC policy", "stored_security_finding", 0.9, ["email:read", "quarantine:write"]));
  }
  return actions;
}
