-- Must run before the correction migration adds the foreign key.
UPDATE "idempotency_keys" AS keys
SET "email_id" = NULL
WHERE keys."email_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "emails" AS emails WHERE emails."id" = keys."email_id"
  );
