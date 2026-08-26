CREATE TYPE "organization_role" AS ENUM ('owner', 'admin', 'security_analyst', 'auditor', 'member');
CREATE TYPE "incident_severity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "incident_status" AS ENUM ('open', 'investigating', 'contained', 'resolved');

CREATE TABLE "organizations" (
  "id" TEXT PRIMARY KEY,
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(80) NOT NULL UNIQUE,
  "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "organizations_created_idx" ON "organizations" ("created_at");

CREATE TABLE "organization_members" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "organization_role" NOT NULL DEFAULT 'member',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "organization_members_org_user_unique" UNIQUE ("organization_id", "user_id")
);
CREATE INDEX "organization_members_user_idx" ON "organization_members" ("user_id", "organization_id");

CREATE TABLE "security_incidents" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "severity" "incident_severity" NOT NULL DEFAULT 'medium',
  "status" "incident_status" NOT NULL DEFAULT 'open',
  "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "assigned_to" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ(6)
);
CREATE INDEX "security_incidents_org_status_idx" ON "security_incidents" ("organization_id", "status", "created_at");
CREATE INDEX "security_incidents_org_severity_idx" ON "security_incidents" ("organization_id", "severity", "created_at");

CREATE TABLE "organization_api_keys" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "key_prefix" VARCHAR(16) NOT NULL,
  "key_hash" TEXT NOT NULL UNIQUE,
  "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "last_used_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "organization_api_keys_org_idx" ON "organization_api_keys" ("organization_id", "revoked_at");

CREATE TABLE "organization_webhooks" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "url" TEXT NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "events" TEXT[] NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "last_delivery_at" TIMESTAMPTZ(6),
  "created_by" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX "organization_webhooks_org_active_idx" ON "organization_webhooks" ("organization_id", "active");

ALTER TABLE "audit_logs" ADD COLUMN "organization_id" TEXT REFERENCES "organizations"("id") ON DELETE SET NULL;
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" ("organization_id", "created_at");
