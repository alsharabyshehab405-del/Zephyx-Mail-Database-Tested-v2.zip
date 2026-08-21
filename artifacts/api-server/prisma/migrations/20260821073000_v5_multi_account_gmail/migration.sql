-- Global Product Foundation v5: provider-neutral Gmail account foundation.
ALTER TABLE "gmail_connections" ADD COLUMN IF NOT EXISTS "provider" varchar(30);
ALTER TABLE "gmail_connections" ADD COLUMN IF NOT EXISTS "external_account_id" text;
ALTER TABLE "gmail_connections" ADD COLUMN IF NOT EXISTS "email_address" varchar(255);
ALTER TABLE "gmail_connections" ADD COLUMN IF NOT EXISTS "display_name" varchar(255);
ALTER TABLE "gmail_connections" ADD COLUMN IF NOT EXISTS "scopes" text;
ALTER TABLE "gmail_connections" ADD COLUMN IF NOT EXISTS "sync_status" varchar(30);

UPDATE "gmail_connections"
SET "provider" = COALESCE("provider", 'gmail'),
    "external_account_id" = COALESCE("external_account_id", "gmail_email"),
    "email_address" = COALESCE("email_address", "gmail_email"),
    "scopes" = COALESCE("scopes", "scope"),
    "sync_status" = COALESCE("sync_status", 'connected');

ALTER TABLE "gmail_connections" ALTER COLUMN "provider" SET NOT NULL;
ALTER TABLE "gmail_connections" ALTER COLUMN "external_account_id" SET NOT NULL;
ALTER TABLE "gmail_connections" ALTER COLUMN "email_address" SET NOT NULL;
ALTER TABLE "gmail_connections" ALTER COLUMN "sync_status" SET NOT NULL;
ALTER TABLE "gmail_connections" ALTER COLUMN "provider" SET DEFAULT 'gmail';
ALTER TABLE "gmail_connections" ALTER COLUMN "sync_status" SET DEFAULT 'connected';

ALTER TABLE "gmail_connections" DROP CONSTRAINT IF EXISTS "gmail_connections_user_id_unique";
DROP INDEX IF EXISTS "gmail_connections_user_id_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "gmail_connections_provider_external_unique" ON "gmail_connections" ("provider", "external_account_id");
CREATE INDEX IF NOT EXISTS "gmail_connections_user_idx" ON "gmail_connections" ("user_id");
