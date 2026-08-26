import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const billingPlans = pgTable("billing_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  displayName: text("display_name").notNull(),
  monthlyPriceMinor: integer("monthly_price_minor").notNull().default(0),
  limits: jsonb("limits").notNull().$type<Record<string, number>>(),
  featureFlags: jsonb("feature_flags").notNull().$type<Record<string, boolean>>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingSubscriptions = pgTable("billing_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  planCode: text("plan_code").notNull().references(() => billingPlans.code),
  provider: text("provider").notNull().default("fake"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  status: text("status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userActiveUnique: uniqueIndex("billing_subscriptions_user_active_unique").on(table.userId, table.status),
}));

export const billingUsage = pgTable("billing_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  quantity: integer("quantity").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  metricPeriodUnique: uniqueIndex("billing_usage_metric_period_unique").on(table.userId, table.metric, table.periodStart),
}));
