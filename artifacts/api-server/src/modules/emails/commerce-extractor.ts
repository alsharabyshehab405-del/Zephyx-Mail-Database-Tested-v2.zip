export type CommerceEmail = { id: string; subject: string; bodyText: string; fromEmail: string; createdAt: string; };

export type OrderRecord = {
  sourceEmailId: string;
  orderNumber: string | null;
  merchant: string | null;
  purchaseDate: string | null;
  total: string | null;
  currency: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  deliveryState: "ordered" | "shipped" | "out_for_delivery" | "delivered" | "delayed" | "cancelled" | "returned" | "unknown";
  receiptAvailable: boolean;
  state: "EXTRACTED_FROM_EMAIL";
  providerState: "NOT_CONFIGURED";
};

export type FinanceRecord = {
  sourceEmailId: string;
  kind: "receipt" | "invoice" | "bill";
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  dueDate: string | null;
  paymentStatus: "paid" | "due" | "overdue" | "unknown";
  state: "EXTRACTED_FROM_EMAIL";
  providerState: "NOT_CONFIGURED";
};

function firstMatch(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.[1]?.trim() || null;
}

function money(text: string): { amount: string | null; currency: string | null } {
  const match = /(?:total|amount|balance|المبلغ|الإجمالي|المجموع)\s*[:=]?\s*([$€£]|USD|EUR|GBP|AED|SAR)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i.exec(text);
  if (!match) return { amount: null, currency: null };
  const currency = match[1] ? ({ $: "USD", "€": "EUR", "£": "GBP" }[match[1]] ?? match[1].toUpperCase()) : null;
  return { amount: match[2].replace(/,/g, ""), currency };
}

function deliveryState(text: string): OrderRecord["deliveryState"] {
  if (/\breturned|مرتجع/i.test(text)) return "returned";
  if (/\bcancelled|canceled|ملغى/i.test(text)) return "cancelled";
  if (/\bdelayed|late|متأخر/i.test(text)) return "delayed";
  if (/\bout for delivery|في طريقه للتوصيل/i.test(text)) return "out_for_delivery";
  if (/\bdelivered|تم التوصيل/i.test(text)) return "delivered";
  if (/\bshipped|dispatched|تم الشحن/i.test(text)) return "shipped";
  return "ordered";
}

export function extractOrder(email: CommerceEmail): OrderRecord | null {
  const text = `${email.subject}\n${email.bodyText}`.slice(0, 20_000);
  if (!/\b(order|purchase|shipment|tracking|delivery|طلب|شراء|شحنة|توصيل)\b/i.test(text)) return null;
  const trackingUrl = text.match(/https?:\/\/[^\s<>]+/i)?.[0] ?? null;
  return {
    sourceEmailId: email.id,
    orderNumber: firstMatch(text, /(?:order|confirmation|purchase)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{4,})/i),
    merchant: email.fromEmail.split("@")[1] ?? null,
    purchaseDate: firstMatch(text, /(?:purchase|ordered|date)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i),
    total: money(text).amount,
    currency: money(text).currency,
    trackingNumber: firstMatch(text, /(?:tracking|shipment)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{6,})/i),
    carrier: firstMatch(text, /(?:carrier|courier)\s*[:=]?\s*([A-Za-z][A-Za-z -]{2,40})/i),
    trackingUrl,
    estimatedDelivery: firstMatch(text, /(?:estimated delivery|delivery date|التوصيل المتوقع)\s*[:=]?\s*([^\n.]{3,60})/i),
    deliveryState: deliveryState(text),
    receiptAvailable: /\b(receipt|invoice|إيصال|فاتورة)\b/i.test(text),
    state: "EXTRACTED_FROM_EMAIL",
    providerState: "NOT_CONFIGURED",
  };
}

export function extractFinance(email: CommerceEmail): FinanceRecord | null {
  const text = `${email.subject}\n${email.bodyText}`.slice(0, 20_000);
  const kind = /\b(receipt|إيصال)\b/i.test(text) ? "receipt" : /\b(invoice|فاتورة)\b/i.test(text) ? "invoice" : /\b(bill|statement|فاتورة مستحقة|استحقاق)\b/i.test(text) ? "bill" : null;
  if (!kind) return null;
  const values = money(text);
  return {
    sourceEmailId: email.id,
    kind,
    merchant: email.fromEmail.split("@")[1] ?? null,
    amount: values.amount,
    currency: values.currency,
    dueDate: firstMatch(text, /(?:due|payment due|استحقاق|تاريخ الدفع)\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i),
    paymentStatus: /\bpaid|مدفوع/i.test(text) ? "paid" : /\boverdue|متأخر/i.test(text) ? "overdue" : /\bdue|مستحق/i.test(text) ? "due" : "unknown",
    state: "EXTRACTED_FROM_EMAIL",
    providerState: "NOT_CONFIGURED",
  };
}
