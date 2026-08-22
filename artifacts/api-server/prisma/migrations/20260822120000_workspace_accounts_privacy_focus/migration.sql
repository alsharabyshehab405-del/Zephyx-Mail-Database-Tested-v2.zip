-- Unified workspace accounts, follow-up scoping, privacy controls, and focus mode.
-- Append-only and idempotent for existing PostgreSQL environments.

ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "account_id" TEXT;
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "account_id" TEXT;
ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "account_id" TEXT;
ALTER TABLE "email_follow_ups"
  ADD COLUMN IF NOT EXISTS "account_id" TEXT;
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "email_follow_ups"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "workspace_preferences"
  ADD COLUMN IF NOT EXISTS "active_account_id" TEXT;
ALTER TABLE "workspace_preferences"
  ADD COLUMN IF NOT EXISTS "focus_mode" TEXT NOT NULL DEFAULT 'focus';
ALTER TABLE "workspace_preferences"
  ADD COLUMN IF NOT EXISTS "privacy_external_images_blocked" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workspace_preferences"
  ADD COLUMN IF NOT EXISTS "privacy_tracking_pixels_blocked" BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_preferences_active_account_id_gmail_connections_id_fk') THEN
    ALTER TABLE "workspace_preferences"
      ADD CONSTRAINT "workspace_preferences_active_account_id_gmail_connections_id_fk"
      FOREIGN KEY ("active_account_id") REFERENCES "gmail_connections"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_account_id_gmail_connections_id_fk') THEN
    ALTER TABLE "emails"
      ADD CONSTRAINT "emails_account_id_gmail_connections_id_fk"
      FOREIGN KEY ("account_id") REFERENCES "gmail_connections"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_account_id_gmail_connections_id_fk') THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_account_id_gmail_connections_id_fk"
      FOREIGN KEY ("account_id") REFERENCES "gmail_connections"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_account_id_gmail_connections_id_fk') THEN
    ALTER TABLE "calendar_events"
      ADD CONSTRAINT "calendar_events_account_id_gmail_connections_id_fk"
      FOREIGN KEY ("account_id") REFERENCES "gmail_connections"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follow_ups_account_id_gmail_connections_id_fk') THEN
    ALTER TABLE "email_follow_ups"
      ADD CONSTRAINT "follow_ups_account_id_gmail_connections_id_fk"
      FOREIGN KEY ("account_id") REFERENCES "gmail_connections"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "emails_user_account_created_idx"
  ON "emails" ("user_id", "account_id", "created_at");
CREATE INDEX IF NOT EXISTS "tasks_user_account_status_idx"
  ON "tasks" ("user_id", "account_id", "status");
CREATE INDEX IF NOT EXISTS "calendar_events_user_account_start_idx"
  ON "calendar_events" ("user_id", "account_id", "starts_at");
CREATE INDEX IF NOT EXISTS "email_follow_ups_user_account_status_idx"
  ON "email_follow_ups" ("user_id", "account_id", "status");
