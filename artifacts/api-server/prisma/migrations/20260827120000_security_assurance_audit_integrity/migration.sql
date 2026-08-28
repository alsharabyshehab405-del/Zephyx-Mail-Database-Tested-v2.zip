ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "previous_integrity_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "integrity_hash" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_integrity_hash_idx"
  ON "audit_logs" ("organization_id", "created_at", "id");
