-- Add query indexes used by active-session and one-time-token lookups.
-- This migration is additive and safe to run whether the previous auth-feature
-- migration was just applied or had already been deployed.

CREATE INDEX IF NOT EXISTS "refresh_tokens_active_session_idx"
  ON "refresh_tokens" ("user_id", "revoked", "expires_at");

CREATE INDEX IF NOT EXISTS "email_verification_tokens_user_used_idx"
  ON "email_verification_tokens" ("user_id", "used_at");

CREATE INDEX IF NOT EXISTS "email_verification_tokens_expires_idx"
  ON "email_verification_tokens" ("expires_at");

CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_used_idx"
  ON "password_reset_tokens" ("user_id", "used_at");

CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_idx"
  ON "password_reset_tokens" ("expires_at");
