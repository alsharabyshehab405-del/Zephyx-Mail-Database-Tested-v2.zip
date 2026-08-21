#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to an isolated verification database}"
: "${BACKUP_FILE:?BACKUP_FILE must point to a backup dump}"
: "${VERIFY_TABLE:?VERIFY_TABLE must identify a table to verify}"
: "${VERIFY_QUERY:?VERIFY_QUERY must be a safe read-only SQL query}"

sha256sum --check "$BACKUP_FILE.sha256"
result_before="$(psql "$DATABASE_URL" -Atqc "$VERIFY_QUERY")"
if [[ -z "$result_before" ]]; then
  echo 'Verification query returned no marker before restore' >&2
  exit 1
fi
ALLOW_DATABASE_RESTORE=YES_I_HAVE_VERIFIED_THE_TARGET \
  DATABASE_URL="$DATABASE_URL" BACKUP_FILE="$BACKUP_FILE" \
  "$(dirname "$0")/restore-postgres.sh"
result_after="$(psql "$DATABASE_URL" -Atqc "$VERIFY_QUERY")"
[[ "$result_after" == "$result_before" ]]
printf 'backup_restore=passed\nverified_table=%s\n' "$VERIFY_TABLE"
