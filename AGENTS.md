# DokerFace Engineering Guide

## Project Goal

DokerFace is a private, server-authoritative web platform for 2-8 player no-limit Texas Hold'em.
The product requirements are defined in `Feature.md`; the chosen technical design is defined in
`Architecture.md`. Treat those documents as authoritative and keep implementation behavior aligned
with both.

The expected production scale is fewer than 50 accounts and about 10 concurrent users. The target
deployment is a single 2 vCPU / 4GB RAM server using Docker Compose.

## Current State

Completed and committed:

- Product functionality and poker rules in `Feature.md`.
- Modular-monolith architecture and implementation route in `Architecture.md`.
- Python 3.12 backend project managed by uv, with a locked dependency graph.
- FastAPI application factory and `/api/v1` API prefix.
- Environment-based settings via Pydantic Settings.
- Async SQLAlchemy database engine/session infrastructure for PostgreSQL.
- CORS and structured JSON logging foundations.
- Liveness endpoint: `GET /api/v1/health/live`.
- Database readiness endpoint: `GET /api/v1/health/ready`.
- Ruff, Pyright, pytest, pytest-asyncio, Hypothesis, and testcontainers tooling.
- Two health endpoint tests.
- Account, profile, and session persistence models with PostgreSQL identity IDs and role/status
  enums.
- Alembic configuration and the first accounts/profiles/sessions migration.
- PostgreSQL integration coverage for migration execution, identity IDs, uniqueness, and relations.
- Argon2 password hashing service backed by `pwdlib`.
- Administrator bootstrap service that requires environment credentials only for a fresh database.
- Opaque session token generation with SHA-256 token hashes.
- Docker Compose deployment baseline for PostgreSQL, the API, and Caddy.

Backend implementation commit:

```text
419c07e Bootstrap backend service
```

Account persistence commit:

```text
a03f269 Add account persistence models and migrations
```

Password service commit:

```text
0e06e33 Add Argon2 password service
```

Administrator bootstrap commit:

```text
00f5f55 Add administrator bootstrap service
```

Session token commit:

```text
2f613fd Add opaque session token service
```

Deployment commit:

```text
63506fa Add Docker deployment roadmap
```

Deployment files:

- `backend/Dockerfile`: production image using Python 3.12, uv, locked production dependencies,
  a non-root user, and one Uvicorn worker.
- `deploy/compose.yml`: PostgreSQL, API, and Caddy services with health checks and persistent
  volumes.
- `deploy/Caddyfile`: API and future Socket.IO reverse proxy.
- `deploy/.env.example`: local Compose settings and bootstrap administrator placeholders.
- `deploy/README.md`: startup and shutdown instructions.

## Verification Status

Last successful checks:

```text
Ruff: passed
Pyright strict mode: passed for the account and authentication foundation changes
pytest: 10 passed
Alembic head: 0001_create_accounts
PostgreSQL integration test: passed
Compose database migration: applied at 0001_create_accounts (head)
Compose configuration: parsed successfully
API image rebuild with migration files: passed
PostgreSQL container: healthy
API container: healthy
Caddy container: running
GET /api/v1/health/live: 200
GET /api/v1/health/ready: 200
git diff --check: passed
```

Docker image construction and runtime health checks were verified from the user's WSL terminal with
Docker Desktop on 2026-07-15 using:

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yml config
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T api alembic upgrade head
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T api alembic current
curl -f http://localhost:8080/api/v1/health/live
curl -f http://localhost:8080/api/v1/health/ready
```

## Technology Decisions

- Backend: Python 3.12, FastAPI, Pydantic, python-socketio.
- Poker rules: PokerKit behind a project-owned adapter. No other module may import PokerKit.
- Persistence: PostgreSQL, SQLAlchemy 2 async, asyncpg, Alembic.
- Passwords: pwdlib with Argon2; passwords must never be stored in plaintext.
- Frontend: React, TypeScript, Vite, TanStack Query, Zustand, Radix UI, Tailwind CSS.
- Deployment: Caddy, one API process/worker, PostgreSQL, Docker Compose.
- In-progress rooms and games live in API process memory. Redis, Celery, Kafka, and Kubernetes are
  intentionally excluded at the current scale.

Running more than one API worker is forbidden in the initial architecture: workers would own
different in-memory room states. A server restart voids incomplete matches as specified in
`Feature.md`.

## Repository Layout

```text
backend/
├── app/
│   ├── api/
│   ├── accounts/
│   ├── db/
│   ├── config.py
│   ├── logging.py
│   └── main.py
├── alembic.ini
├── migrations/
├── tests/
├── Dockerfile
├── pyproject.toml
└── uv.lock

deploy/
├── Caddyfile
├── compose.yml
├── .env.example
└── README.md
```

Add new backend domains under `backend/app/` using the boundaries in `Architecture.md` rather than
placing unrelated behavior in route handlers.

## Development Commands

Run local backend checks from `backend/`:

```bash
UV_CACHE_DIR=/tmp/dokerface-uv-cache uv sync --dev
UV_CACHE_DIR=/tmp/dokerface-uv-cache uv run --locked ruff format .
UV_CACHE_DIR=/tmp/dokerface-uv-cache uv run --locked ruff check .
UV_CACHE_DIR=/tmp/dokerface-uv-cache uv run --locked pytest -q
UV_CACHE_DIR=/tmp/dokerface-uv-cache XDG_CACHE_HOME=/tmp/dokerface-xdg-cache uv run --locked pyright
```

Pyright's Python wrapper downloads a Node runtime on first use. In restricted environments it may
require network approval. Do not add the approximately 60MB `pyright[nodejs]` wheel to project
dependencies solely to work around an ephemeral sandbox cache.

Run the local API without Docker:

```bash
uv run uvicorn app.main:app --reload
```

## Git Policy

The user explicitly requires fine-grained, reversible Git history.

- Complete one small, coherent feature at a time.
- Run relevant formatting, type, and test checks before every commit.
- Commit immediately after the feature is verified.
- Use imperative English commit subjects, for example `Add account persistence models`.
- Do not combine unrelated refactors, formatting, or generated churn with a feature commit.
- Do not rewrite, squash, or amend existing history unless the user explicitly requests it.
- Never discard user changes from a dirty worktree.

## Backend Implementation Route

### 1. Docker baseline

- Validate Compose configuration against the Docker daemon.
- Build the API image.
- Start PostgreSQL, API, and Caddy.
- Confirm PostgreSQL and API health checks become healthy.
- Commit deployment configuration as an independent node.

### 2. Accounts and migrations

- Add SQLAlchemy models for accounts, profiles, and sessions.
- Use PostgreSQL identity IDs beginning at 1 for permanent `account_id` values.
- Add enums/constraints for administrator vs player and active/disabled/deleted states.
- Initialize Alembic and create the first migration.
- Add PostgreSQL integration tests for schema creation, uniqueness, and relationships.
- Commit persistence models and migration separately from API behavior.

### 3. Administrator bootstrap and authentication

- Create the initial administrator from environment variables only when no administrator exists.
- Hash passwords with pwdlib/Argon2.
- Implement opaque session tokens stored as hashes in the database.
- Implement login, logout, current-user, session expiry, and forced session revocation.
- Add administrator authorization dependencies.
- Test successful login, bad credentials, disabled accounts, expiry, logout, and role checks.
- Commit bootstrap, sessions, and HTTP authentication as small independent nodes.

### 4. Account administration and public profiles

- Implement administrator account create, disable, restore, soft-delete, password-reset, and role
  update APIs.
- Implement public player list/detail APIs and self profile updates.
- Allow duplicate display names and distinguish players by `account_id`.
- Add avatar validation and normalized thumbnails using Pillow.
- Record all administrator mutations in audit logs.

### 5. Room domain and real-time transport

- Add room configuration persistence and validation for all `Feature.md` limits.
- Integrate python-socketio with cookie authentication and Origin checks.
- Implement lobby updates, room create/join/leave, seats, readiness, host controls, and invitations.
- Enforce one active game connection per account.
- Implement public room chat, quick messages, custom quick messages, and emote events.

### 6. PokerKit contract and match engine

- Pin PokerKit and implement the adapter described in `Architecture.md`.
- Add deterministic contract tests for heads-up order, minimum raises, short all-ins, multiple side
  pots, split pots, odd chips, fold wins, board-only hands, and show/muck behavior.
- Implement `MatchCoordinator` for winner-takes-all and fixed-hand-count modes.
- Implement blind doubling, button movement, elimination, and match completion.
- Use one asyncio queue/task per running match so player and timeout commands are serialized.
- Do not continue to networking/UI work if PokerKit contract tests expose unresolved rule gaps.

### 7. Snapshots, timers, and reconnects

- Add state versions and idempotent command IDs.
- Generate separate public, player-private, and spectator snapshots.
- Implement finite action timers and the 60-second disconnected-player fallback for unlimited rooms.
- Replace old connections on reconnect and send a full current snapshot.
- Persist only completed hands/matches; void incomplete matches after process restart.

### 8. Match persistence and history

- Add matches, match players, hands, hand players, actions, and pots tables.
- Persist each completed hand in one transaction.
- Persist final match results only after normal completion.
- Implement player-visible history and replay APIs without leaking unshown hole cards.
- Implement administrator match lookup and voiding.

### 9. Statistics

- Implement a versioned pure reducer over confirmed hand actions.
- Store counters required for total matches, win rate, profitable match rate, VPIP, PFR, 3-Bet,
  showdown rate, showdown win rate, average pot, fold rate, all-in count, recent form, and position
  usage.
- Derive ratios at query time and return insufficient-data state for zero/small denominators.
- Ensure statistics can be rebuilt from persisted actions.

### 10. Rating and leaderboard

- Implement the multiplayer Elo formula in `Feature.md` as a pure function.
- Add rating batches, current ratings, history, per-match changes, and fixed rank thresholds.
- Set every new account to 1000 points and display its rank immediately.
- Settle every normally completed match in one database transaction.
- Implement deterministic leaderboard tie-breaking.
- Implement administrator global reset by creating a new rating batch.
- When a settled match is voided, replay all valid matches in the current batch chronologically.

### 11. Hardening and deployment completion

- Add property tests for chip conservation, card uniqueness, actor legality, side-pot eligibility,
  and zero-sum Elo changes.
- Add end-to-end tests for account setup, room start, one complete hand, reconnect, match settlement,
  leaderboard update, and rating reset.
- Add database backup/restore scripts, log rotation, health checks, and CI.
- Load test 10 concurrent clients on a 2 vCPU / 4GB environment.

## Open Product Decisions

The following remain unresolved in `Feature.md` and must not be silently invented when they affect
behavior materially:

- Spectator capacity and whether spectators may join mid-match.
- Mid-match player joining, rebuying, and voluntary seat-leave behavior.
- Whether small blind is always exactly half the big blind and whether ante is enabled.
- Fixed-hand-mode tie ranking and reward behavior.
- Exact host transfer behavior when the host leaves voluntarily.
- Nickname change frequency and account/history retention periods.

Implement surrounding work first when possible. Before finalizing one of these behaviors, obtain a
user decision and update `Feature.md` together with the implementation.
