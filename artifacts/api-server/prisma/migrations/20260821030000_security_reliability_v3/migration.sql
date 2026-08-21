CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "success" TEXT NOT NULL DEFAULT 'true',
  "ip_hash" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "audit_logs_user_created_idx" ON "audit_logs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_idx" ON "audit_logs" ("action", "created_at");
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "email_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "idempotency_keys_user_key_unique" UNIQUE ("user_id", "key")
);
CREATE INDEX IF NOT EXISTS "idempotency_keys_expiry_idx" ON "idempotency_keys" ("expires_at");
