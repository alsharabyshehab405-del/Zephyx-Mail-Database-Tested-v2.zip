-- Smart Inbox Categories: append-only taxonomy and scoped user feedback.
-- Legacy enum values remain available for compatibility and are normalized in application code.
DO $$
BEGIN
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'work';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'promotions';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'newsletters';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'orders';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'travel';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'finance';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'bills';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'events';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'security';
  ALTER TYPE "email_category" ADD VALUE IF NOT EXISTS 'spam';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;


ALTER TABLE "workspace_preferences"
  ADD COLUMN IF NOT EXISTS "category_preferences" JSONB NOT NULL DEFAULT '{"visibleCategories":["primary","work","social","promotions","newsletters","orders","travel","finance","bills","events","security","spam"],"order":["primary","work","social","promotions","newsletters","orders","travel","finance","bills","events","security","spam"]}'::jsonb;

CREATE TABLE IF NOT EXISTS "email_category_feedback" (
  "id" TEXT PRIMARY KEY,
  "email_id" TEXT NOT NULL REFERENCES "emails"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organization_id" TEXT NOT NULL DEFAULT 'personal',
  "category" "email_category" NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "email_category_feedback_email_org_user_unique" UNIQUE ("email_id", "organization_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "email_category_feedback_org_category_idx"
  ON "email_category_feedback" ("organization_id", "category", "updated_at");
CREATE INDEX IF NOT EXISTS "email_category_feedback_user_category_idx"
  ON "email_category_feedback" ("user_id", "category", "updated_at");
