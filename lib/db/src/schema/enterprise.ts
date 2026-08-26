import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const organizationRoleEnum = pgEnum("organization_role", ["owner", "admin", "security_analyst", "auditor", "member"]);
export const incidentSeverityEnum = pgEnum("incident_severity", ["low", "medium", "high", "critical"]);
export const incidentStatusEnum = pgEnum("incident_status", ["open", "investigating", "contained", "resolved"]);

export const organizationsTable = pgTable("organizations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  aiPhishingEnabled: boolean("ai_phishing_enabled").notNull().default(false),
  aiPhishingConsentAt: timestamp("ai_phishing_consent_at", { withTimezone: true }),
}, (table) => [index("organizations_created_idx").on(table.createdAt)]);

export const organizationMembersTable = pgTable("organization_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: organizationRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("organization_members_org_user_unique").on(table.organizationId, table.userId),
  index("organization_members_user_idx").on(table.userId, table.organizationId),
]);

export const securityIncidentsTable = pgTable("security_incidents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull().default(""),
  severity: incidentSeverityEnum("severity").notNull().default("medium"),
  status: incidentStatusEnum("status").notNull().default("open"),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  index("security_incidents_org_status_idx").on(table.organizationId, table.status, table.createdAt),
  index("security_incidents_org_severity_idx").on(table.organizationId, table.severity, table.createdAt),
]);

export const organizationApiKeysTable = pgTable("organization_api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("organization_api_keys_org_idx").on(table.organizationId, table.revokedAt)]);

export const organizationWebhooksTable = pgTable("organization_webhooks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secretHash: text("secret_hash").notNull(),
  events: text("events").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("organization_webhooks_org_active_idx").on(table.organizationId, table.active)]);

export type Organization = typeof organizationsTable.$inferSelect;
export type OrganizationMember = typeof organizationMembersTable.$inferSelect;
export type SecurityIncident = typeof securityIncidentsTable.$inferSelect;
export type OrganizationApiKey = typeof organizationApiKeysTable.$inferSelect;
export type OrganizationWebhook = typeof organizationWebhooksTable.$inferSelect;
