-- Global Product Foundation v5: expand the persisted user locale enum.
-- Existing en/ar values are preserved; new values are additive and idempotent.
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'pt';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'it';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'tr';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'ru';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'zh-CN';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'ja';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'ko';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'hi';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'id';
ALTER TYPE "locale" ADD VALUE IF NOT EXISTS 'ur';
