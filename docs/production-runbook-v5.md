# Zephyx Mail v5 Production Runbook

## Dependency readiness

PostgreSQL is the source of truth for users, emails, Outbox, devices, notification preferences, and delivery records. Redis is an internal wake-up and BullMQ transport for the dedicated Worker and Scheduler; it must not be exposed publicly. ClamAV is an external attachment-scanning dependency. If attachment scanning is enabled and ClamAV is unavailable, uploads fail closed.

## Redis unavailable

The API keeps a scheduled email in PostgreSQL Outbox before attempting Redis publication. A temporary Redis failure is logged with a redacted correlation identifier; the Scheduler republishes due Outbox rows after Redis returns. Check `/api/health/worker/ready` and the protected Prometheus metrics for Redis readiness and queue lag.

## PostgreSQL unavailable

Readiness returns an unavailable status without connection details. Stop writes, verify the database service and connection pool, and do not manually mark Outbox or delivery records completed. Restore connectivity, apply pending migrations in order, and re-run the migration compatibility check.

## Queue backlog and dead-letter

Inspect queue lag, stale leases, retry counts, and dead-letter totals through the Admin-protected metrics endpoint. PostgreSQL owns retry state and `max_attempts`; do not repeatedly requeue a `dead_letter` record without identifying the failure class. Permanent 4xx/provider validation errors go directly to dead-letter.

## `delivery_unknown`

SMTP socket/greeting timeout or a connection break after the provider may have accepted a message moves the delivery to `delivery_unknown` and does not retry automatically. Reconcile with the provider using the message identifier or provider logs before any manual action. This protects against duplicate external delivery.

## Gmail OAuth revoked

Mark only the affected provider account revoked, do not disconnect other accounts, and ask the user to reconnect that account. Tokens are encrypted at rest and never included in logs, SSE events, push payloads, or telemetry.

## Push provider unavailable

The provider-neutral push adapter records a privacy-safe delivery result and never includes full message bodies or attachments. Web Push/FCM are disabled unless explicitly configured. Use the in-app SSE/refresh path as a fallback.

## Search regression

Check query length/limit guardrails, PostgreSQL indexes, and the documented `simple` full-text/trigram strategy. Use a representative non-sensitive fixture with `EXPLAIN (ANALYZE, BUFFERS)` in a non-production database. Never paste user queries or message content into logs.

## Rollback and migration safety

Take a verified backup before rollback. Migrations are append-only and must be applied from an empty database in CI and against a v4 fixture database in compatibility tests. Do not edit historical migrations. If a forward migration fails, stop deployment and restore from backup rather than deleting schema state.

## Key rotation

Rotate JWT, session, Gmail token-encryption, ClamAV, VAPID, FCM, and telemetry credentials through the deployment secret manager. Never commit a real key or copy it into `.env.example`. Roll keys in a staged manner that permits active sessions and provider refreshes to expire safely.
