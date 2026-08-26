DO $$
BEGIN
  CREATE TYPE "idempotency_status" AS ENUM ('processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "audit_logs"
  ALTER COLUMN "success" DROP DEFAULT,
  ALTER COLUMN "success" TYPE BOOLEAN USING (lower("success") IN ('true', 't', '1', 'yes')),
  ALTER COLUMN "success" SET DEFAULT true;

ALTER TABLE "idempotency_keys"
  ADD COLUMN IF NOT EXISTS "response_status" INTEGER,
  ADD COLUMN IF NOT EXISTS "response_body" JSONB;

ALTER TABLE "idempotency_keys"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "idempotency_status" USING "status"::"idempotency_status",
  ALTER COLUMN "status" SET DEFAULT 'processing'::"idempotency_status";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_keys_email_id_emails_id_fk') THEN
    ALTER TABLE "idempotency_keys"
      ADD CONSTRAINT "idempotency_keys_email_id_emails_id_fk"
      FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE SET NULL;
  END IF;
END $$;
