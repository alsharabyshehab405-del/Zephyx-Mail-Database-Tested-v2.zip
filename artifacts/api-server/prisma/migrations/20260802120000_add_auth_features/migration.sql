-- ── Migration: add_auth_features ───────────────────────────────────────────────
-- Adds email verification, password reset tokens, and session tracking.
-- Fully additive — no existing data is dropped or modified (except backfill below).

-- 1. Add emailVerifiedAt to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ;

-- 2. Add session-tracking columns to refresh_tokens
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "device_name" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip_hash" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMPTZ;
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ;

-- 3. Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_verification_tokens_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE
);

-- 4. Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE ("token_hash"),
    CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE
);

-- 5. Backfill: existing users are considered email-verified
--    (they registered before email verification was required).
UPDATE "users"
SET "email_verified_at" = "created_at"
WHERE "email_verified_at" IS NULL;
