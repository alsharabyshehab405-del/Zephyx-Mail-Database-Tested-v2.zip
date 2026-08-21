-- Global Product Foundation v5: bounded PostgreSQL search foundation.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "search_document" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple'::regconfig,
      coalesce("subject", '') || ' ' ||
      coalesce("from_email", '') || ' ' ||
      coalesce("body_text", '') || ' ' ||
      coalesce("to_addresses"::text, '') || ' ' ||
      coalesce("cc_addresses"::text, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "emails_search_document_gin_idx"
  ON "emails" USING GIN ("search_document");
CREATE INDEX IF NOT EXISTS "emails_subject_trgm_idx"
  ON "emails" USING GIN ("subject" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "emails_from_email_trgm_idx"
  ON "emails" USING GIN ("from_email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "emails_user_created_id_cursor_idx"
  ON "emails" ("user_id", "created_at" DESC, "id" DESC);
