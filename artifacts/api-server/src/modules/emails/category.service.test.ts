import { describe, expect, it } from "vitest";
import { CANONICAL_EMAIL_CATEGORIES, classifyLocalEmail, isCanonicalEmailCategory, normalizeLegacyEmailCategory } from "./category.rules.js";

describe("Smart Inbox category taxonomy", () => {
  it("exposes the twelve canonical categories", () => {
    expect(CANONICAL_EMAIL_CATEGORIES).toHaveLength(12);
    expect(new Set(CANONICAL_EMAIL_CATEGORIES).size).toBe(12);
    expect(CANONICAL_EMAIL_CATEGORIES).toEqual([
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
    ]);
  });

  it("rejects legacy values as new input and normalizes legacy stored rows", () => {
    expect(isCanonicalEmailCategory("promotions")).toBe(true);
    expect(isCanonicalEmailCategory("promotional")).toBe(false);
    expect(normalizeLegacyEmailCategory("promotional")).toBe("promotions");
    expect(normalizeLegacyEmailCategory("updates")).toBe("primary");
    expect(normalizeLegacyEmailCategory("untrusted")).toBe("primary");
  });

  it("classifies security, orders, newsletters and promotions with explainable rules", () => {
    expect(classifyLocalEmail("Verify your account", "Security alert: sign-in detected", "alerts@example.invalid").category).toBe("security");
    expect(classifyLocalEmail("Your order shipped", "Tracking number and delivery update", "orders@example.invalid").category).toBe("orders");
    expect(classifyLocalEmail("Weekly newsletter", "Unsubscribe from this mailing list", "news@example.invalid").category).toBe("newsletters");
    expect(classifyLocalEmail("50% sale", "Limited time coupon offer", "shop@example.invalid").category).toBe("promotions");
  });

  it("returns a deterministic primary fallback when no stronger signal exists", () => {
    const result = classifyLocalEmail("Hello", "A normal personal message", "friend@example.invalid");
    expect(result.category).toBe("primary");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasons[0]?.source).toBe("rule");
  });
});
