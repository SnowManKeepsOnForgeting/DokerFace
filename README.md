# DokerFace

English | [中文](README_zh.md)

DokerFace is a server-authoritative no-limit Texas Hold'em platform for 2-8 players. The project
consists of a FastAPI/Socket.IO backend, React frontend, PostgreSQL database, and Caddy reverse
proxy.

## Repository Layout

- `backend/`: Python 3.12 backend, Alembic migrations, and tests
- `frontend/`: React + TypeScript + Vite frontend
- `deploy/`: Docker Compose, Caddy, backup, and restore scripts
- `Feature.md`, `Architecture.md`, `Frontend.md`: product and technical design documents

## Runtime Modes

| Scenario | Address | `DOKERFACE_ENVIRONMENT` | HTTPS | Purpose |
| --- | --- | --- | --- | --- |
| Local development | Frontend `http://localhost:5173`, API `http://localhost:8080` | `development` | No | Daily development and debugging |
| Local Compose verification | `http://localhost:8080` | `development` | No | Verify the complete container stack |
| Public production server | `https://your-domain` | `production` | Yes | Production use |

The committed `deploy/Caddyfile.example` and `deploy/compose.example.yml` provide the deployment
defaults. Copy them to the Git-ignored local files before use. Public production deployment
requires the domain and port changes documented below.

## Local Development

The backend requires Python 3.12 and uv:

```bash
cd backend
uv sync --dev
uv run uvicorn app.main:app --reload
```

The API prefix is `/api/v1`. Run backend quality checks with:

```bash
uv run --locked ruff format .
uv run --locked ruff check .
uv run --locked pyright
uv run --locked pytest -q
```

For frontend development:

```bash
cd frontend
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The frontend development server runs at <http://localhost:5173>, while the development API runs at
<http://localhost:8080>. Ensure `DOKERFACE_CORS_ORIGINS` contains both local origins.

## Local Docker Compose Verification

### Prerequisites

- Docker Engine and Docker Compose v2
- An application port (default `8080`) available; PostgreSQL binds to `127.0.0.1:5432` by default

### First Start

From the repository root, create the local deployment files:

```bash
cp deploy/.env.example deploy/.env
cp deploy/compose.example.yml deploy/compose.yml
cp deploy/Caddyfile.example deploy/Caddyfile
```

The generated files are ignored by Git and may be customized for the current environment.

Edit `deploy/.env` and replace at least these sensitive values:

```dotenv
POSTGRES_PASSWORD=use-a-strong-random-password
DOKERFACE_BOOTSTRAP_ADMIN_LOGIN=admin
DOKERFACE_BOOTSTRAP_ADMIN_PASSWORD=use-a-strong-random-password
```

Keep these values for local verification:

```dotenv
DOKERFACE_ENVIRONMENT=development
DOKERFACE_CORS_ORIGINS=["http://localhost:5173","http://localhost:8080"]
HTTP_PORT=8080
```

Validate the Compose configuration, then build and start the stack:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

The one-shot `migrate` service waits for PostgreSQL and applies all pending Alembic migrations.
The API starts only after the migration completes successfully.

Endpoints:

- Web/API entry point: <http://localhost:8080>
- Liveness: <http://localhost:8080/api/v1/health/live>
- Database readiness: <http://localhost:8080/api/v1/health/ready>

On the first startup, the bootstrap credentials create an administrator only when no administrator
exists in the database. They do not overwrite an existing administrator.

## Public Production Server

Use a Linux host with at least 2 vCPUs and 4 GB RAM and a domain that resolves to the server's
public IP address. Expose TCP ports 80 and 443; also expose UDP 443 when HTTP/3 is desired. Do not
expose PostgreSQL publicly.

### Production Configuration Differences

Change the first line of `deploy/Caddyfile` from `:80` to the real domain, for example:

```caddyfile
poker.example.com {
```

Caddy will automatically obtain and renew the HTTPS certificate. The domain must resolve correctly,
and ports 80 and 443 must be publicly reachable.

In `deploy/compose.yml`, replace the Caddy port mapping:

```yaml
ports:
  - "${HTTP_PORT:-8080}:80"
```

with:

```yaml
ports:
  - "80:80"
  - "443:443"
  - "443:443/udp"
```

Use production values in the server's `deploy/.env`:

```dotenv
DOKERFACE_ENVIRONMENT=production
DOKERFACE_CORS_ORIGINS=["https://poker.example.com"]
```

Replace the example domain with the real domain. `production` marks login cookies as `Secure`, so
browsers only send them over HTTPS. It does not enable HTTPS by itself and must be paired with the
Caddy configuration above.

Start the production stack with the same Compose command:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

Verify the deployment:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps -a
docker compose --env-file deploy/.env -f deploy/compose.yml logs migrate
docker compose --env-file deploy/.env -f deploy/compose.yml logs caddy
curl -f https://poker.example.com/api/v1/health/live
curl -f https://poker.example.com/api/v1/health/ready
```

## Updating a Deployment

Before a production update, ensure no match is in progress. Active rooms and matches reside in the
API process memory, so restarting the API voids unfinished matches. Back up the database, then deploy
an explicit Git tag or commit:

```bash
KEEP_COUNT=14 deploy/backup.sh
git fetch --tags origin
git status --short
git checkout <new-version-tag-or-commit>
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

This rebuilds the frontend and backend images and runs `alembic upgrade head` before the API starts.
The migration command is safe when no migrations are pending. `deploy/.env` is not changed by Git
updates and must never be committed.

Inspect service status and logs:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps -a
docker compose --env-file deploy/.env -f deploy/compose.yml logs migrate
docker compose --env-file deploy/.env -f deploy/compose.yml logs -f api
```

The `migrate` container showing `Exited (0)` is expected; it is a one-shot task rather than a
long-running service.

Stop services while preserving database data:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml down
```

Do not use `down -v` unless you intend to delete the PostgreSQL data volume.

## Backups and Restore

The backup script creates a compressed PostgreSQL dump and SHA-256 sidecar file, retaining the
newest 14 backups by default:

```bash
KEEP_COUNT=14 deploy/backup.sh
sha256sum -c deploy/backups/*.sql.gz.sha256
```

Backups are written to `deploy/backups/`, which is ignored by Git. A typical nightly cron entry is:

```cron
15 3 * * * cd /srv/dokerface && /srv/dokerface/deploy/backup.sh >> /var/log/dokerface-backup.log 2>&1
```

Restore replaces the current database contents and requires explicit confirmation. Stop the API and
Caddy first:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml stop api caddy
CONFIRM_RESTORE=yes deploy/restore.sh deploy/backups/dokerface-YYYYMMDDTHHMMSSZ.sql.gz
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
```

## Production Notes

- Never commit `deploy/.env` or use the example passwords.
- Change the bootstrap administrator password after the first login.
- Run only one API worker initially because active rooms and matches are held in API process memory.
- Compose configures container log rotation (10 MiB per file, five files); host-level log shipping is
  the deployment operator's responsibility.

## License and Product Documentation

This is currently a private project. Product constraints, architecture boundaries, and the frontend
roadmap are defined in `Feature.md`, `Architecture.md`, and `Frontend.md`.
