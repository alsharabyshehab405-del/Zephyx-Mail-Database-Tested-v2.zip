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
import { gmailConnectionsTable } from "./gmail_connections";

export type ThreatVerdict = "pass" | "fail" | "softfail" | "neutral" | "none" | "unknown";
export type ThreatRiskLevel = "none" | "low" | "medium" | "high";
export type ThreatUrlVerdict = "safe" | "suspicious" | "malicious" | "unknown";

export type ThreatReason = {
  code: string;
  score: number;
  label: string;
};

export type ThreatUrlFinding = {
  url: string;
  host: string | null;
  verdict: ThreatUrlVerdict;
  reasons: string[];
};

export const emailThreatAnalysesTable = pgTable(
  "email_threat_analyses",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emailsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => gmailConnectionsTable.id, {
      onDelete: "set null",
    }),
    spfResult: varchar("spf_result", { length: 16 }).notNull().default("unknown"),
    dkimResult: varchar("dkim_result", { length: 16 }).notNull().default("unknown"),
    dmarcResult: varchar("dmarc_result", { length: 16 }).notNull().default("unknown"),
    authenticationSource: varchar("authentication_source", { length: 80 }),
    returnPathDomain: varchar("return_path_domain", { length: 255 }),
    fromDomain: varchar("from_domain", { length: 255 }),
    spoofingRisk: varchar("spoofing_risk", { length: 16 }).notNull().default("none"),
    spamScore: integer("spam_score").notNull().default(0),
    spamReasons: jsonb("spam_reasons").$type<ThreatReason[]>().notNull().default([]),
    urlFindings: jsonb("url_findings").$type<ThreatUrlFinding[]>().notNull().default([]),
    malwareStatus: varchar("malware_status", { length: 20 }).notNull().default("not_scanned"),
    overallRisk: varchar("overall_risk", { length: 16 }).notNull().default("none"),
    analysisVersion: varchar("analysis_version", { length: 20 }).notNull().default("v1"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_threat_analyses_email_unique").on(table.emailId),
    index("email_threat_analyses_user_risk_idx").on(table.userId, table.overallRisk, table.analyzedAt),
    index("email_threat_analyses_account_idx").on(table.accountId, table.analyzedAt),
  ],
);

export type EmailThreatAnalysis = typeof emailThreatAnalysesTable.$inferSelect;
export type InsertEmailThreatAnalysis = typeof emailThreatAnalysesTable.$inferInsert;

export const emailSecurityReportsTable = pgTable(
  "email_security_reports",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emailsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    reportType: varchar("report_type", { length: 16 }).notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_security_reports_user_email_type_unique").on(
      table.userId,
      table.emailId,
      table.reportType,
    ),
    index("email_security_reports_user_created_idx").on(table.userId, table.createdAt),
    index("email_security_reports_email_idx").on(table.emailId),
  ],
);

export type EmailSecurityReport = typeof emailSecurityReportsTable.$inferSelect;
export type InsertEmailSecurityReport = typeof emailSecurityReportsTable.$inferInsert;
