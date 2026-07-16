#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_FILE="${1:-}"

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
    printf 'Set CONFIRM_RESTORE=yes to restore a backup and replace database contents\n' >&2
    exit 2
fi
if [[ -z "$BACKUP_FILE" || ! -r "$BACKUP_FILE" || "$BACKUP_FILE" != *.sql.gz ]]; then
    printf 'Usage: CONFIRM_RESTORE=yes %s <backup.sql.gz>\n' "$0" >&2
    exit 2
fi

if [[ -r "$BACKUP_FILE.sha256" ]]; then
    sha256sum --check "$BACKUP_FILE.sha256"
fi

compose_args=(-f "$COMPOSE_FILE")
if [[ -f "$ENV_FILE" ]]; then
    compose_args=(--env-file "$ENV_FILE" "${compose_args[@]}")
fi

gzip -cd -- "$BACKUP_FILE" \
    | docker compose "${compose_args[@]}" exec -T postgres \
        sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1'

printf 'Restored %s\n' "$BACKUP_FILE"
