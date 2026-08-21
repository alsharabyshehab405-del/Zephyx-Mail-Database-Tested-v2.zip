DO $$
BEGIN
  CREATE TYPE "dispatch_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead_letter');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "email_dispatch_outbox" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "email_id" TEXT NOT NULL,
  "job_key" TEXT NOT NULL,
  "queue_name" TEXT NOT NULL,
  "status" "dispatch_status" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "available_at" TIMESTAMPTZ NOT NULL,
  "next_attempt_at" TIMESTAMPTZ,
  "lease_expires_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "correlation_id" TEXT,
  "completed_at" TIMESTAMPTZ,
  "duration_ms" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "email_dispatch_outbox_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_dispatch_outbox_job_key_unique" ON "email_dispatch_outbox" ("job_key");
CREATE INDEX IF NOT EXISTS "email_dispatch_outbox_due_idx" ON "email_dispatch_outbox" ("status", "available_at");
CREATE INDEX IF NOT EXISTS "email_dispatch_outbox_lease_idx" ON "email_dispatch_outbox" ("status", "lease_expires_at");
CREATE INDEX IF NOT EXISTS "email_dispatch_outbox_email_idx" ON "email_dispatch_outbox" ("email_id");
