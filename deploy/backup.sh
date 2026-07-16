#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_COUNT="${KEEP_COUNT:-14}"

if [[ ! "$KEEP_COUNT" =~ ^[1-9][0-9]*$ ]]; then
    printf 'KEEP_COUNT must be a positive integer\n' >&2
    exit 2
fi

compose_args=(-f "$COMPOSE_FILE")
if [[ -f "$ENV_FILE" ]]; then
    compose_args=(--env-file "$ENV_FILE" "${compose_args[@]}")
fi

install -d -m 700 "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/dokerface-$timestamp.sql.gz"

docker compose "${compose_args[@]}" exec -T postgres \
    sh -c 'pg_dump --clean --if-exists --no-owner --no-privileges --format=plain --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
    | gzip -c > "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'dokerface-*.sql.gz' -printf '%T@ %p\n' \
    | sort -nr \
    | tail -n +$((KEEP_COUNT + 1)) \
    | cut -d' ' -f2- \
    | while IFS= read -r old_backup; do
        [[ -n "$old_backup" ]] || continue
        rm -f -- "$old_backup" "$old_backup.sha256"
    done

printf 'Created %s\n' "$backup_file"
