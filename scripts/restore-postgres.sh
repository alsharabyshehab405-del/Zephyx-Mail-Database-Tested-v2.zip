#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Target DATABASE_URL must be provided through the secret manager}"
: "${BACKUP_FILE:?BACKUP_FILE must point to a verified custom-format dump}"

if [[ ! -f "$BACKUP_FILE" || ! -f "$BACKUP_FILE.sha256" ]]; then
  echo 'Backup file and adjacent checksum are required' >&2
  exit 1
fi
sha256sum --check "$BACKUP_FILE.sha256"
if [[ "${ALLOW_DATABASE_RESTORE:-}" != "YES_I_HAVE_VERIFIED_THE_TARGET" ]]; then
  echo 'Refusing restore: set ALLOW_DATABASE_RESTORE=YES_I_HAVE_VERIFIED_THE_TARGET explicitly' >&2
  exit 1
fi

pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-acl --exit-on-error "$BACKUP_FILE"
printf 'restore=completed\nbackup=%s\n' "$BACKUP_FILE"
