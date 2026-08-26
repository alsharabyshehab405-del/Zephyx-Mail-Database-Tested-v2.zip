-- Scalability Readiness: targeted read and scheduler indexes only.
-- Append-only and idempotent; no table or column rewrites.

CREATE INDEX IF NOT EXISTS "emails_user_folder_created_id_idx"
  ON "emails" ("user_id", "folder", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "emails_user_unread_created_id_idx"
  ON "emails" ("user_id", "is_read", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "emails_user_custom_folder_created_id_idx"
  ON "emails" ("user_id", "custom_folder_id", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "emails_user_labels_gin_idx"
  ON "emails" USING GIN ("labels");

CREATE INDEX IF NOT EXISTS "email_dispatch_outbox_due_next_attempt_idx"
  ON "email_dispatch_outbox" ("status", "available_at", "next_attempt_at", "id");
