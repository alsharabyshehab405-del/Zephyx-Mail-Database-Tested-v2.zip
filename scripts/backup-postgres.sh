#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be provided through the secret manager}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$BACKUP_DIR/zephyx-postgres-$stamp.dump"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$base"
sha256sum "$base" > "$base.sha256"
chmod 600 "$base" "$base.sha256"
find "$BACKUP_DIR" -type f -name 'zephyx-postgres-*.dump' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'zephyx-postgres-*.dump.sha256' -mtime "+$RETENTION_DAYS" -delete
printf 'backup=%s\nchecksum=%s\n' "$base" "$base.sha256"
