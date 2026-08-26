ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "ai_phishing_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_phishing_consent_at" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "email_ai_phishing_analyses" (
  "id" TEXT NOT NULL,
  "email_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL DEFAULT 'personal',
  "user_id" TEXT NOT NULL,
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "verdict" VARCHAR(20) NOT NULL DEFAULT 'not_configured',
  "reasons" JSONB NOT NULL DEFAULT '[]',
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "recommended_action" VARCHAR(240) NOT NULL DEFAULT 'No AI provider is configured.',
  "provider" VARCHAR(80) NOT NULL DEFAULT 'none',
  "model" VARCHAR(120),
  "analysis_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "analyzed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_ai_phishing_analyses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_ai_phishing_analyses_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE,
  CONSTRAINT "email_ai_phishing_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_ai_phishing_email_org_user_unique"
  ON "email_ai_phishing_analyses" ("email_id", "organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "email_ai_phishing_org_verdict_idx"
  ON "email_ai_phishing_analyses" ("organization_id", "verdict", "analyzed_at");
CREATE INDEX IF NOT EXISTS "email_ai_phishing_user_email_idx"
  ON "email_ai_phishing_analyses" ("user_id", "email_id", "analyzed_at");
