DO $$ BEGIN CREATE TYPE "email_status" AS ENUM ('draft','pending_send','scheduled','sending','sent','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "email_category" AS ENUM ('primary','promotional','updates','social'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "email_folder" AS ENUM ('inbox','sent','drafts','starred','archive','trash','spam'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "task_status" AS ENUM ('open','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "task_priority" AS ENUM ('low','normal','high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bridge the original minimal schema to the active Drizzle/Prisma model without
-- dropping legacy columns or data. Defaults keep old NOT NULL columns compatible
-- with inserts made by the current application.
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT NOW();
ALTER TABLE "folders"
  ALTER COLUMN "updated_at" SET DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "color" VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS "icon" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "email_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "emails"
  ALTER COLUMN "subject" TYPE VARCHAR(998),
  ALTER COLUMN "subject" SET DEFAULT '',
  ALTER COLUMN "body" SET DEFAULT '',
  ALTER COLUMN "sender" SET DEFAULT '',
  ALTER COLUMN "recipient" SET DEFAULT '',
  ALTER COLUMN "updated_at" SET DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "from_email" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "from_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "to_addresses" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "cc_addresses" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "bcc_addresses" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "body_html" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "body_text" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "folder" "email_folder" NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS "custom_folder_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_draft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "attachments" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "thread_id" TEXT,
  ADD COLUMN IF NOT EXISTS "reply_to_id" TEXT,
  ADD COLUMN IF NOT EXISTS "message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "in_reply_to" TEXT,
  ADD COLUMN IF NOT EXISTS "references" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "labels" JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "status" "email_status" NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "send_error" TEXT,
  ADD COLUMN IF NOT EXISTS "category" "email_category" NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS "ai_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "snoozed_until" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emails' AND column_name='body') THEN
    UPDATE "emails" SET "body_text" = "body" WHERE "body_text" = '' AND "body" <> '';
    UPDATE "emails" SET "body_html" = "body" WHERE "body_html" = '' AND "body" <> '';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emails' AND column_name='sender') THEN
    UPDATE "emails" SET "from_email" = "sender" WHERE "from_email" = '' AND "sender" <> '';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emails' AND column_name='recipient') THEN
    UPDATE "emails"
      SET "to_addresses" = jsonb_build_array(jsonb_build_object('email', "recipient"))
      WHERE "to_addresses" = '[]'::jsonb AND "recipient" <> '';
  END IF;
END $$;

UPDATE "emails" SET "sent_at" = "created_at" WHERE "sent_at" IS NULL;
UPDATE "emails" SET "status" = 'draft' WHERE "is_draft" = true AND "status" = 'sent';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_custom_folder_id_folders_id_fk') THEN
    ALTER TABLE "emails" ADD CONSTRAINT "emails_custom_folder_id_folders_id_fk"
      FOREIGN KEY ("custom_folder_id") REFERENCES "folders"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "emails_delivery_queue_idx" ON "emails"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "emails_snoozed_idx" ON "emails"("user_id", "snoozed_until");
CREATE INDEX IF NOT EXISTS "emails_message_headers_idx" ON "emails"("user_id", "message_id", "in_reply_to");
CREATE INDEX IF NOT EXISTS "emails_category_idx" ON "emails"("user_id", "category");

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT '',
  "body_html" TEXT NOT NULL DEFAULT '',
  "body_text" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "email_templates_user_name_unique" UNIQUE("user_id", "name")
);
CREATE INDEX IF NOT EXISTS "email_templates_user_idx" ON "email_templates"("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email_id" TEXT REFERENCES "emails"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "due_at" TIMESTAMPTZ,
  "status" "task_status" NOT NULL DEFAULT 'open',
  "priority" "task_priority" NOT NULL DEFAULT 'normal',
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "tasks_user_status_due_idx" ON "tasks"("user_id", "status", "due_at");

CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email_id" TEXT REFERENCES "emails"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "location" TEXT,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "attendees" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "provider" TEXT NOT NULL DEFAULT 'local',
  "external_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "calendar_events_user_external_unique" UNIQUE("user_id", "external_id")
);
CREATE INDEX IF NOT EXISTS "calendar_events_user_start_idx" ON "calendar_events"("user_id", "starts_at");
