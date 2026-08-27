import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { emailsTable } from "./emails";
import { organizationsTable } from "./enterprise";
import { securityIncidentsTable } from "./enterprise";

export const quarantineStatusEnum = pgEnum("quarantine_status", ["quarantined", "released", "reported", "appealed"]);
export const policyScopeEnum = pgEnum("enterprise_policy_scope", ["organization", "user", "group"]);
export const policyActionEnum = pgEnum("enterprise_policy_action", ["allow", "warn", "quarantine", "block"]);
export const campaignStatusEnum = pgEnum("threat_campaign_status", ["open", "monitoring", "contained", "resolved"]);
export const privacyRequestTypeEnum = pgEnum("privacy_request_type", ["export", "delete"]);
export const privacyRequestStatusEnum = pgEnum("privacy_request_status", ["requested", "in_progress", "completed", "rejected"]);

export const quarantineItemsTable = pgTable("quarantine_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  incidentId: text("incident_id").references(() => securityIncidentsTable.id, { onDelete: "set null" }),
  reason: varchar("reason", { length: 500 }).notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  status: quarantineStatusEnum("status").notNull().default("quarantined"),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  resolvedBy: text("resolved_by").references(() => usersTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("quarantine_items_org_email_user_unique").on(table.organizationId, table.emailId, table.userId),
  index("quarantine_items_org_status_created_idx").on(table.organizationId, table.status, table.createdAt),
  index("quarantine_items_email_idx").on(table.emailId),
]);

export const enterprisePoliciesTable = pgTable("enterprise_policies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  scope: policyScopeEnum("scope").notNull().default("organization"),
  targetUserId: text("target_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  targetGroup: varchar("target_group", { length: 120 }),
  enabled: boolean("enabled").notNull().default(true),
  riskThreshold: integer("risk_threshold").notNull().default(80),
  linkAction: policyActionEnum("link_action").notNull().default("warn"),
  attachmentAction: policyActionEnum("attachment_action").notNull().default("quarantine"),
  senderAction: policyActionEnum("sender_action").notNull().default("warn"),
  allowlist: text("allowlist").array().notNull().default([]),
  blocklist: text("blocklist").array().notNull().default([]),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("enterprise_policies_org_name_unique").on(table.organizationId, table.name),
  index("enterprise_policies_org_scope_idx").on(table.organizationId, table.scope, table.enabled),
  index("enterprise_policies_target_user_idx").on(table.organizationId, table.targetUserId, table.enabled),
]);

export const spamLearningEventsTable = pgTable("spam_learning_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
  feedbackType: varchar("feedback_type", { length: 20 }).notNull(),
  senderDomain: varchar("sender_domain", { length: 255 }).notNull(),
  signal: varchar("signal", { length: 120 }).notNull(),
  reason: varchar("reason", { length: 240 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("spam_learning_events_org_email_user_unique").on(table.organizationId, table.emailId, table.userId),
  index("spam_learning_events_org_domain_idx").on(table.organizationId, table.senderDomain, table.createdAt),
  index("spam_learning_events_org_type_idx").on(table.organizationId, table.feedbackType, table.createdAt),
]);

export const threatCampaignsTable = pgTable("threat_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  status: campaignStatusEnum("status").notNull().default("open"),
  riskScore: integer("risk_score").notNull().default(0),
  messageCount: integer("message_count").notNull().default(0),
  evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("threat_campaigns_org_fingerprint_unique").on(table.organizationId, table.fingerprint),
  index("threat_campaigns_org_status_idx").on(table.organizationId, table.status, table.lastSeenAt),
]);

export const threatCampaignMembersTable = pgTable("threat_campaign_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaign_id").notNull().references(() => threatCampaignsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  relation: varchar("relation", { length: 80 }).notNull().default("similar_sender_subject"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("threat_campaign_members_campaign_email_unique").on(table.campaignId, table.emailId),
  index("threat_campaign_members_org_email_idx").on(table.organizationId, table.emailId),
]);

export const privacyRequestsTable = pgTable("privacy_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  requestType: privacyRequestTypeEnum("request_type").notNull(),
  status: privacyRequestStatusEnum("status").notNull().default("requested"),
  reason: varchar("reason", { length: 500 }).notNull().default(""),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("privacy_requests_user_status_idx").on(table.userId, table.status, table.requestedAt),
  index("privacy_requests_org_status_idx").on(table.organizationId, table.status, table.requestedAt),
]);

export const consentRecordsTable = pgTable("consent_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  consentType: varchar("consent_type", { length: 80 }).notNull(),
  scope: varchar("scope", { length: 40 }).notNull().default("organization"),
  granted: boolean("granted").notNull(),
  source: varchar("source", { length: 80 }).notNull().default("api"),
  redactionVersion: varchar("redaction_version", { length: 20 }).notNull().default("v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("consent_records_org_type_idx").on(table.organizationId, table.consentType, table.createdAt),
  index("consent_records_user_type_idx").on(table.userId, table.consentType, table.createdAt),
]);

export type QuarantineItem = typeof quarantineItemsTable.$inferSelect;
export type EnterprisePolicy = typeof enterprisePoliciesTable.$inferSelect;
export type SpamLearningEvent = typeof spamLearningEventsTable.$inferSelect;
export type ThreatCampaign = typeof threatCampaignsTable.$inferSelect;
export type ThreatCampaignMember = typeof threatCampaignMembersTable.$inferSelect;
export type PrivacyRequest = typeof privacyRequestsTable.$inferSelect;
export type ConsentRecord = typeof consentRecordsTable.$inferSelect;
