-- Integrate the previously manual Gmail and persistent-attachment migrations
-- into the canonical Prisma deployment path. Every statement is idempotent so
-- installations that already applied the manual SQL remain safe.

CREATE TABLE IF NOT EXISTS "gmail_connections" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "gmail_email" VARCHAR(255) NOT NULL,
  "encrypted_access_token" TEXT NOT NULL,
  "encrypted_refresh_token" TEXT,
  "token_expiry" TIMESTAMPTZ,
  "scope" TEXT,
  "token_type" VARCHAR(50),
  "last_history_id" TEXT,
  "last_synced_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT "gmail_connections_user_id_unique" UNIQUE ("user_id"),
  CONSTRAINT "gmail_connections_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE
);

ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "gmail_message_id" TEXT,
  ADD COLUMN IF NOT EXISTS "gmail_thread_id" TEXT,
  ADD COLUMN IF NOT EXISTS "gmail_history_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "emails_user_gmail_message_unique"
  ON "emails" ("user_id", "gmail_message_id");

CREATE INDEX IF NOT EXISTS "emails_user_gmail_thread_idx"
  ON "emails" ("user_id", "gmail_thread_id");

CREATE TABLE IF NOT EXISTS "email_attachment_objects" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "owner_user_id" TEXT,
  "storage_key" TEXT NOT NULL,
  "filename" VARCHAR(998) NOT NULL,
  "mime_type" VARCHAR(255) DEFAULT 'application/octet-stream' NOT NULL,
  "size" INTEGER NOT NULL,
  "checksum_sha256" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT "email_attachment_objects_owner_user_id_users_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_attachment_objects_storage_key_unique"
  ON "email_attachment_objects" ("storage_key");

CREATE INDEX IF NOT EXISTS "email_attachment_objects_owner_idx"
  ON "email_attachment_objects" ("owner_user_id");

CREATE INDEX IF NOT EXISTS "email_attachment_objects_created_idx"
  ON "email_attachment_objects" ("created_at");
