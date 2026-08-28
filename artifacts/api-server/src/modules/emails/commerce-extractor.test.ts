import { describe, expect, it } from "vitest";
import { extractFinance, extractOrder } from "./commerce-extractor.js";

const base = { id: "email-1", fromEmail: "merchant@example.invalid", createdAt: "2026-08-28T00:00:00.000Z" };

describe("local commerce extraction", () => {
  it("extracts an order without claiming live carrier tracking", () => {
    const order = extractOrder({ ...base, subject: "Order #AB-123 shipped", bodyText: "Total: USD 49.99\nTracking number: ZX-998877\nEstimated delivery: 2026-09-01" });
    expect(order?.orderNumber).toBe("AB-123");
    expect(order?.trackingNumber).toBe("ZX-998877");
    expect(order?.deliveryState).toBe("shipped");
    expect(order?.providerState).toBe("NOT_CONFIGURED");
  });

  it("extracts finance facts from the message and keeps unknowns null", () => {
    const finance = extractFinance({ ...base, subject: "Invoice", bodyText: "Amount: $120.00\nDue: 2026-09-03" });
    expect(finance).toMatchObject({ kind: "invoice", amount: "120.00", currency: "USD", dueDate: "2026-09-03", paymentStatus: "due", providerState: "NOT_CONFIGURED" });
  });
});
