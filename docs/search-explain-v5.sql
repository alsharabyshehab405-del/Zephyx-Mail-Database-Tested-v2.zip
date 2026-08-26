-- Run only against a non-production fixture database.
-- The user_id predicate is mandatory for tenant isolation.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, subject, sender, received_at, is_read, is_starred
FROM emails
WHERE user_id = '00000000-0000-0000-0000-000000000001'
  AND to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(sender, '') || ' ' || coalesce(body_text, ''))
      @@ plainto_tsquery('simple', 'invoice')
ORDER BY received_at DESC, id DESC
LIMIT 51;

-- Production queries must use parameterized values, a bounded query length,
-- a bounded page size, and a stable cursor predicate on (received_at, id).
