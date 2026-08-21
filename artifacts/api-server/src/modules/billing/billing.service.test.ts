import { describe, expect, it } from "vitest";
import { BillingService, FakePaymentProvider, defaultBillingPlans } from "./billing.service.js";

describe("billing foundation", () => {
  it("provisions a deterministic trial and exposes feature flags", async () => {
    const service = new BillingService(defaultBillingPlans());
    const now = new Date("2026-01-01T00:00:00.000Z");
    const trial = await service.provisionTrial("user-1", "trial", now);
    expect(trial.status).toBe("trialing");
    expect(trial.trialEndsAt?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(service.canUse(trial, "ai")).toBe(true);
  });

  it("meters usage and rejects the first operation above a plan limit", () => {
    const service = new BillingService(defaultBillingPlans());
    const subscription = { userId: "user-1", planCode: "free", status: "active" as const, trialEndsAt: null };
    service.assertWithinLimit(subscription, "dailySends", 25);
    expect(() => service.assertWithinLimit(subscription, "dailySends", 1)).toThrow("billing_limit_exceeded");
    expect(service.getUsage("user-1", "dailySends")).toBe(25);
  });

  it("uses a fake payment provider without external credentials", async () => {
    const service = new BillingService(defaultBillingPlans(), new FakePaymentProvider());
    const result = await service.createPaidSubscription({ userId: "user-1", planCode: "trial", status: "trialing", trialEndsAt: null });
    expect(result.subscription.status).toBe("active");
    expect(result.providerSubscriptionId).toContain("fake_subscription");
  });
});
