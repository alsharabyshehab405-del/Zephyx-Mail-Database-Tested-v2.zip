ALTER TABLE "email_attachment_objects"
  ADD COLUMN IF NOT EXISTS "scan_status" VARCHAR(20) NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS "scan_engine" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "scanned_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "email_attachment_objects_scan_idx"
  ON "email_attachment_objects" ("scan_status", "scanned_at");

CREATE TABLE IF NOT EXISTS "email_threat_analyses" (
  "id" TEXT PRIMARY KEY,
  "email_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "account_id" TEXT,
  "spf_result" VARCHAR(16) NOT NULL DEFAULT 'unknown',
  "dkim_result" VARCHAR(16) NOT NULL DEFAULT 'unknown',
  "dmarc_result" VARCHAR(16) NOT NULL DEFAULT 'unknown',
  "authentication_source" VARCHAR(80),
  "return_path_domain" VARCHAR(255),
  "from_domain" VARCHAR(255),
  "spoofing_risk" VARCHAR(16) NOT NULL DEFAULT 'none',
  "spam_score" INTEGER NOT NULL DEFAULT 0,
  "spam_reasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "url_findings" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "malware_status" VARCHAR(20) NOT NULL DEFAULT 'not_scanned',
  "overall_risk" VARCHAR(16) NOT NULL DEFAULT 'none',
  "analysis_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
  "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "email_threat_analyses_email_id_emails_id_fk"
    FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE,
  CONSTRAINT "email_threat_analyses_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "email_threat_analyses_account_id_gmail_connections_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "gmail_connections"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_threat_analyses_email_unique"
  ON "email_threat_analyses" ("email_id");
CREATE INDEX IF NOT EXISTS "email_threat_analyses_user_risk_idx"
  ON "email_threat_analyses" ("user_id", "overall_risk", "analyzed_at");
CREATE INDEX IF NOT EXISTS "email_threat_analyses_account_idx"
  ON "email_threat_analyses" ("account_id", "analyzed_at");

CREATE TABLE IF NOT EXISTS "email_security_reports" (
  "id" TEXT PRIMARY KEY,
  "email_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "report_type" VARCHAR(16) NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "email_security_reports_email_id_emails_id_fk"
    FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE,
  CONSTRAINT "email_security_reports_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "email_security_reports_type_check"
    CHECK ("report_type" IN ('spam', 'phishing'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_security_reports_user_email_type_unique"
  ON "email_security_reports" ("user_id", "email_id", "report_type");
CREATE INDEX IF NOT EXISTS "email_security_reports_user_created_idx"
  ON "email_security_reports" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "email_security_reports_email_idx"
  ON "email_security_reports" ("email_id");
