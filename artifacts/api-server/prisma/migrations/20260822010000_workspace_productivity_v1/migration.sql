-- Workspace productivity v1: persisted view preferences and explicit follow-up intent.
-- This migration is additive and safe to run against existing staging databases.

ALTER TABLE "email_follow_ups"
  ADD COLUMN IF NOT EXISTS "waiting_for_reply" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "workspace_preferences" (
  "user_id" TEXT NOT NULL,
  "inbox_density" TEXT NOT NULL DEFAULT 'comfortable',
  "inbox_layout" TEXT NOT NULL DEFAULT 'two-pane',
  "visible_sections" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "visible_columns" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "accent_color" TEXT NOT NULL DEFAULT 'indigo',
  "theme" TEXT NOT NULL DEFAULT 'system',
  "keyboard_shortcuts" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "saved_searches" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_preferences_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "workspace_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "email_follow_ups_waiting_reply_idx"
  ON "email_follow_ups" ("user_id", "waiting_for_reply", "status", "remind_at");

ALTER TABLE "workspace_preferences"
  OWNER TO CURRENT_USER;
