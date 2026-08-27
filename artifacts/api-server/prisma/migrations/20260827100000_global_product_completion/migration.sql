CREATE TYPE "quarantine_status" AS ENUM ('quarantined', 'released', 'reported', 'appealed');
CREATE TYPE "enterprise_policy_scope" AS ENUM ('organization', 'user', 'group');
CREATE TYPE "enterprise_policy_action" AS ENUM ('allow', 'warn', 'quarantine', 'block');
CREATE TYPE "threat_campaign_status" AS ENUM ('open', 'monitoring', 'contained', 'resolved');
CREATE TYPE "privacy_request_type" AS ENUM ('export', 'delete');
CREATE TYPE "privacy_request_status" AS ENUM ('requested', 'in_progress', 'completed', 'rejected');

CREATE TABLE "quarantine_items" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "incident_id" TEXT,
  "reason" VARCHAR(500) NOT NULL,
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "status" "quarantine_status" NOT NULL DEFAULT 'quarantined',
  "created_by" TEXT NOT NULL,
  "resolved_by" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  CONSTRAINT "quarantine_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quarantine_items_org_email_user_unique" ON "quarantine_items"("organization_id", "email_id", "user_id");
CREATE INDEX "quarantine_items_org_status_created_idx" ON "quarantine_items"("organization_id", "status", "created_at");
CREATE INDEX "quarantine_items_email_idx" ON "quarantine_items"("email_id");
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_email_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_incident_fkey" FOREIGN KEY ("incident_id") REFERENCES "security_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quarantine_items" ADD CONSTRAINT "quarantine_items_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "enterprise_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "scope" "enterprise_policy_scope" NOT NULL DEFAULT 'organization',
  "target_user_id" TEXT,
  "target_group" VARCHAR(120),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "risk_threshold" INTEGER NOT NULL DEFAULT 80,
  "link_action" "enterprise_policy_action" NOT NULL DEFAULT 'warn',
  "attachment_action" "enterprise_policy_action" NOT NULL DEFAULT 'quarantine',
  "sender_action" "enterprise_policy_action" NOT NULL DEFAULT 'warn',
  "allowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "blocklist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enterprise_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "enterprise_policies_org_name_unique" ON "enterprise_policies"("organization_id", "name");
CREATE INDEX "enterprise_policies_org_scope_idx" ON "enterprise_policies"("organization_id", "scope", "enabled");
CREATE INDEX "enterprise_policies_target_user_idx" ON "enterprise_policies"("organization_id", "target_user_id", "enabled");
ALTER TABLE "enterprise_policies" ADD CONSTRAINT "enterprise_policies_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_policies" ADD CONSTRAINT "enterprise_policies_target_user_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enterprise_policies" ADD CONSTRAINT "enterprise_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "spam_learning_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "email_id" TEXT NOT NULL,
  "feedback_type" VARCHAR(20) NOT NULL,
  "sender_domain" VARCHAR(255) NOT NULL,
  "signal" VARCHAR(120) NOT NULL,
  "reason" VARCHAR(240) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spam_learning_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "spam_learning_events_org_email_user_unique" ON "spam_learning_events"("organization_id", "email_id", "user_id");
CREATE INDEX "spam_learning_events_org_domain_idx" ON "spam_learning_events"("organization_id", "sender_domain", "created_at");
CREATE INDEX "spam_learning_events_org_type_idx" ON "spam_learning_events"("organization_id", "feedback_type", "created_at");
ALTER TABLE "spam_learning_events" ADD CONSTRAINT "spam_learning_events_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spam_learning_events" ADD CONSTRAINT "spam_learning_events_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spam_learning_events" ADD CONSTRAINT "spam_learning_events_email_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "threat_campaigns" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "status" "threat_campaign_status" NOT NULL DEFAULT 'open',
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "message_count" INTEGER NOT NULL DEFAULT 0,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "threat_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "threat_campaigns_org_fingerprint_unique" ON "threat_campaigns"("organization_id", "fingerprint");
CREATE INDEX "threat_campaigns_org_status_idx" ON "threat_campaigns"("organization_id", "status", "last_seen_at");
ALTER TABLE "threat_campaigns" ADD CONSTRAINT "threat_campaigns_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "threat_campaign_members" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "relation" VARCHAR(80) NOT NULL DEFAULT 'similar_sender_subject',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "threat_campaign_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "threat_campaign_members_campaign_email_unique" ON "threat_campaign_members"("campaign_id", "email_id");
CREATE INDEX "threat_campaign_members_org_email_idx" ON "threat_campaign_members"("organization_id", "email_id");
ALTER TABLE "threat_campaign_members" ADD CONSTRAINT "threat_campaign_members_campaign_fkey" FOREIGN KEY ("campaign_id") REFERENCES "threat_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threat_campaign_members" ADD CONSTRAINT "threat_campaign_members_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threat_campaign_members" ADD CONSTRAINT "threat_campaign_members_email_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "threat_campaign_members" ADD CONSTRAINT "threat_campaign_members_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "privacy_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "user_id" TEXT NOT NULL,
  "request_type" "privacy_request_type" NOT NULL,
  "status" "privacy_request_status" NOT NULL DEFAULT 'requested',
  "reason" VARCHAR(500) NOT NULL DEFAULT '',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "privacy_requests_user_status_idx" ON "privacy_requests"("user_id", "status", "requested_at");
CREATE INDEX "privacy_requests_org_status_idx" ON "privacy_requests"("organization_id", "status", "requested_at");
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "consent_records" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "user_id" TEXT NOT NULL,
  "consent_type" VARCHAR(80) NOT NULL,
  "scope" VARCHAR(40) NOT NULL DEFAULT 'organization',
  "granted" BOOLEAN NOT NULL,
  "source" VARCHAR(80) NOT NULL DEFAULT 'api',
  "redaction_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consent_records_org_type_idx" ON "consent_records"("organization_id", "consent_type", "created_at");
CREATE INDEX "consent_records_user_type_idx" ON "consent_records"("user_id", "consent_type", "created_at");
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
