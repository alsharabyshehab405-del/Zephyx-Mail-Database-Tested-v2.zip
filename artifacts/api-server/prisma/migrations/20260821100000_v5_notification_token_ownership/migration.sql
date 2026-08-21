-- v5 notification token ownership: one active device token has one owner globally.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY token_hash ORDER BY last_seen_at DESC, created_at DESC, id DESC) AS position
  FROM device_registrations
  WHERE is_active = true
)
UPDATE device_registrations AS d
SET is_active = false, revoked_at = COALESCE(revoked_at, NOW())
FROM ranked AS r
WHERE d.id = r.id AND r.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "device_registrations_active_token_unique"
  ON "device_registrations" ("token_hash")
  WHERE "is_active" = true;
