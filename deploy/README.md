# Docker deployment

Create the local deployment files from the committed examples:

```bash
cp deploy/.env.example deploy/.env
cp deploy/compose.example.yml deploy/compose.yml
cp deploy/Caddyfile.example deploy/Caddyfile
```

The generated `.env`, `compose.yml`, and `Caddyfile` files are ignored by Git so each deployment
can keep its own credentials, ports, and Caddy site address. Edit them for the target environment
before starting the stack. Keep `compose.example.yml` and `Caddyfile.example` as the versioned
defaults; when either example changes, review the difference before updating an existing local
deployment file.

Validate the resolved Compose configuration, then build and start the stack:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

The one-shot `migrate` service waits for PostgreSQL, applies all pending Alembic migrations, and
must complete successfully before the API starts. Use the same command after pulling a new version;
it is safe when no migrations are pending.

Inspect the migration result with `docker compose --env-file deploy/.env -f deploy/compose.yml ps -a`
and `docker compose --env-file deploy/.env -f deploy/compose.yml logs migrate`. An `Exited (0)`
status is expected after a successful migration.

The reverse proxy listens on <http://localhost:8080>. PostgreSQL is bound to
`127.0.0.1:5432` for local development and is not exposed on external network interfaces.

Stop the services without deleting data:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml down
```

Do not use `down -v` unless the PostgreSQL data volume should be deleted.

## Backups

Create a compressed PostgreSQL backup. The script keeps the newest 14 backups by default; set
`KEEP_COUNT` to change that policy:

```bash
KEEP_COUNT=14 deploy/backup.sh
```

Backups and SHA-256 sidecar files are written to `deploy/backups/`, which is ignored by Git. A
typical host cron entry runs the script once per night:

```cron
15 3 * * * cd /srv/dokerface && /srv/dokerface/deploy/backup.sh >> /var/log/dokerface-backup.log 2>&1
```

To restore, stop the API and reverse proxy first, then explicitly confirm the destructive restore:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml stop api caddy
CONFIRM_RESTORE=yes deploy/restore.sh deploy/backups/dokerface-20260716T030000Z.sql.gz
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

The PostgreSQL, API, and Caddy containers use Docker's `json-file` log driver with a 10 MiB file
limit and five rotated files per container. Host-level log shipping remains the deployment
operator's responsibility.
