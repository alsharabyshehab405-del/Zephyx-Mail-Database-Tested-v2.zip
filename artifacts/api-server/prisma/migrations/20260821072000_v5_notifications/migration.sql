-- Global Product Foundation v5: notification/device foundation.
CREATE TABLE IF NOT EXISTS "device_registrations" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "platform" varchar(20) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "encrypted_push_token" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_registrations_user_token_unique" ON "device_registrations" ("user_id", "token_hash");
CREATE INDEX IF NOT EXISTS "device_registrations_user_active_idx" ON "device_registrations" ("user_id", "is_active");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "push_enabled" boolean NOT NULL DEFAULT true,
  "show_preview" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" text REFERENCES "device_registrations"("id") ON DELETE SET NULL,
  "event_type" varchar(80) NOT NULL,
  "event_id" varchar(160) NOT NULL,
  "status" varchar(30) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "delivered_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_deliveries_device_event_unique" ON "notification_deliveries" ("device_id", "event_id");
CREATE INDEX IF NOT EXISTS "notification_deliveries_user_created_idx" ON "notification_deliveries" ("user_id", "created_at");
