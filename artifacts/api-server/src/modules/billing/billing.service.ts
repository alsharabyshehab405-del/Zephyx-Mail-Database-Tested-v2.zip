export type BillingPlan = {
  code: string;
  limits: Record<string, number>;
  featureFlags: Record<string, boolean>;
  trialDays: number;
};

export type BillingSubscription = {
  userId: string;
  planCode: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt: Date | null;
};

export interface PaymentProviderAdapter {
  createCustomer(userId: string): Promise<{ customerId: string }>;
  createSubscription(customerId: string, planCode: string): Promise<{ subscriptionId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export class FakePaymentProvider implements PaymentProviderAdapter {
  async createCustomer(userId: string): Promise<{ customerId: string }> {
    return { customerId: `fake_customer_${userId}` };
  }
  async createSubscription(customerId: string, planCode: string): Promise<{ subscriptionId: string }> {
    return { subscriptionId: `fake_subscription_${customerId}_${planCode}` };
  }
  async cancelSubscription(): Promise<void> {}
}

export class NotConfiguredPaymentProvider implements PaymentProviderAdapter {
  async createCustomer(): Promise<never> { throw new Error("payment_provider_not_configured"); }
  async createSubscription(): Promise<never> { throw new Error("payment_provider_not_configured"); }
  async cancelSubscription(): Promise<never> { throw new Error("payment_provider_not_configured"); }
}

export class BillingService {
  private readonly usage = new Map<string, number>();
  constructor(private readonly plans: ReadonlyMap<string, BillingPlan>, private readonly provider: PaymentProviderAdapter = new FakePaymentProvider()) {}

  getPlan(code: string): BillingPlan {
    const plan = this.plans.get(code);
    if (!plan) throw new Error("billing_plan_not_found");
    return plan;
  }

  canUse(subscription: BillingSubscription, feature: string): boolean {
    return this.getPlan(subscription.planCode).featureFlags[feature] === true;
  }

  assertWithinLimit(subscription: BillingSubscription, metric: string, increment = 1): void {
    const limit = this.getPlan(subscription.planCode).limits[metric];
    if (limit === undefined) return;
    const key = `${subscription.userId}:${metric}`;
    const next = (this.usage.get(key) ?? 0) + increment;
    if (next > limit) throw new Error("billing_limit_exceeded");
    this.usage.set(key, next);
  }

  getUsage(userId: string, metric: string): number {
    return this.usage.get(`${userId}:${metric}`) ?? 0;
  }

  async provisionTrial(userId: string, planCode: string, now = new Date()): Promise<BillingSubscription> {
    const plan = this.getPlan(planCode);
    const trialEndsAt = new Date(now.getTime() + plan.trialDays * 86_400_000);
    return { userId, planCode, status: "trialing", trialEndsAt };
  }

  async createPaidSubscription(subscription: BillingSubscription): Promise<{ subscription: BillingSubscription; providerSubscriptionId: string }> {
    const customer = await this.provider.createCustomer(subscription.userId);
    const remote = await this.provider.createSubscription(customer.customerId, subscription.planCode);
    return { subscription: { ...subscription, status: "active" }, providerSubscriptionId: remote.subscriptionId };
  }
}

export function defaultBillingPlans(): Map<string, BillingPlan> {
  return new Map([
    ["free", { code: "free", limits: { dailySends: 25, maxStorageBytes: 100 * 1024 * 1024 }, featureFlags: { search: true, ai: false }, trialDays: 0 }],
    ["trial", { code: "trial", limits: { dailySends: 100, maxStorageBytes: 1024 * 1024 * 1024 }, featureFlags: { search: true, ai: true }, trialDays: 14 }],
  ]);
}
