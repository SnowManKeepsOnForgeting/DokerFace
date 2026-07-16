# Docker deployment

Create a local environment file, start PostgreSQL, apply migrations, and start the stack:

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yml up -d postgres
docker compose --env-file deploy/.env -f deploy/compose.yml run --build --rm api alembic upgrade head
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d api caddy
```

Run `alembic upgrade head` again after pulling a commit that adds a database migration, before
starting the API with the new image.

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
docker compose --env-file deploy/.env -f deploy/compose.yml start api caddy
```

The PostgreSQL, API, and Caddy containers use Docker's `json-file` log driver with a 10 MiB file
limit and five rotated files per container. Host-level log shipping remains the deployment
operator's responsibility.
