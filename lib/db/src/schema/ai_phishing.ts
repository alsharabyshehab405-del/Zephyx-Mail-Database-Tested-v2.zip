import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { emailsTable } from "./emails";

export type AiPhishingVerdict = "safe" | "suspicious" | "dangerous" | "blocked" | "not_configured";
export type AiPhishingReason = { code: string; label: string };
export type AiPhishingEvidence = { type: string; summary: string };

export const emailAiPhishingAnalysesTable = pgTable(
  "email_ai_phishing_analyses",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull().default("personal"),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    riskScore: integer("risk_score").notNull().default(0),
    verdict: varchar("verdict", { length: 20 }).notNull().default("not_configured"),
    reasons: jsonb("reasons").$type<AiPhishingReason[]>().notNull().default([]),
    evidence: jsonb("evidence").$type<AiPhishingEvidence[]>().notNull().default([]),
    recommendedAction: varchar("recommended_action", { length: 240 }).notNull().default("No AI provider is configured."),
    provider: varchar("provider", { length: 80 }).notNull().default("none"),
    model: varchar("model", { length: 120 }),
    analysisVersion: varchar("analysis_version", { length: 20 }).notNull().default("v1"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_ai_phishing_email_org_user_unique").on(table.emailId, table.organizationId, table.userId),
    index("email_ai_phishing_org_verdict_idx").on(table.organizationId, table.verdict, table.analyzedAt),
    index("email_ai_phishing_user_email_idx").on(table.userId, table.emailId, table.analyzedAt),
  ],
);

export type EmailAiPhishingAnalysis = typeof emailAiPhishingAnalysesTable.$inferSelect;
export type InsertEmailAiPhishingAnalysis = typeof emailAiPhishingAnalysesTable.$inferInsert;
