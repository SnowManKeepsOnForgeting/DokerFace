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
- Modern React frontend architecture and phased delivery plan in `Frontend.md`.
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
- Database session lifecycle service for creation, authentication, expiry, activity updates, and
  revocation.
- Forced revocation of all active sessions for an account.
- Application startup bootstrap that creates the first administrator after migrations are applied.
- Cookie-authenticated login, logout, current-user, and administrator permission dependencies.
- Administrator audit log persistence with before/after JSON summaries.
- Administrator account creation service with Argon2 hashing and audit records.
- Administrator account lifecycle service for disable, restore, soft-delete, role changes, and
  password resets.
- Administrator account management HTTP API for create, status/role updates, and password reset.
- Async profile loading regression fixed for newly created account responses.
- Authenticated public player list/detail endpoints and self profile updates.
- Text/emoji avatar profiles with centered client rendering data, validated six-digit hex
  background colors, default values, and the `0003_profile_avatars` migration. User-uploaded images
  and Pillow processing are not supported.
- Room rule validation for all explicit `Feature.md` numeric limits, including winner-takes-all and
  fixed-hand modes.
- Persistent room configurations with visibility/status enums, rule JSONB, host foreign key, and
  the `0004_create_rooms` migration.
- Authenticated room create/list/detail HTTP endpoints with hashed password-room secrets.
- Socket.IO Origin/Cookie session authentication, one-active-SID-per-account replacement, and
  versioned waiting-room join/ready/leave events backed by an in-memory membership registry.
- Project-owned PokerKit adapter and pure multi-hand `MatchCoordinator` with heads-up action
  mapping, blind doubling, button rotation, winner-takes-all/fixed-hand lifecycle, and chip
  conservation tests.
- One `asyncio.Queue`-backed `MatchActor` per match with duplicate `command_id` replay and
  monotonic `state_version` snapshots.
- Rich public/private PokerKit snapshots with street, pot, all-in, seat, and legal-action data.
- In-memory active match registry with random start seats, random initial buttons, and frozen
  player display names.
- Socket.IO `room:start`, `game:action`, and `game:request-snapshot` events with public/private
  snapshot broadcasting, stale-command rejection, hand settlement, and room reset after match
  completion.
- Finite decision timers, unlimited-room disconnected-player fallback, active-match SID rebinding,
  and full snapshot recovery after reconnect.
- Match history persistence for completed hands and matches, startup voiding of abandoned active
  matches, private-hole-card history redaction, per-pot settlement details, and administrator voiding.
- Versioned player statistics reducer, persistent counters, statistics rebuild from completed
  `actions`, `GET /api/v1/players/{account_id}/statistics`, and `counted_in_stats` enforcement.
- Multiplayer Elo batches, deterministic leaderboard, startup rating initialization, administrator
  rating reset, and current-batch replay after match voiding.
- Waiting-room host transfer/kick policy, public chat/quick phrases/custom phrases, and emote events.
- Docker Compose deployment baseline for PostgreSQL, the API, and Caddy.
- One-command Compose startup with a one-shot Alembic migration dependency before the API.
- PostgreSQL backup/restore scripts, container log rotation, and backend GitHub Actions quality checks.

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

Database session commit:

```text
f3f0ea1 Add database session service
```

Bootstrap wiring commit:

```text
733ecac Wire administrator bootstrap into application startup
```

HTTP authentication commit:

```text
e32278c Add cookie authentication endpoints
```

Revocation and RBAC commit:

```text
98fee93 Add session revocation and admin authorization
```

Audit log persistence commit:

```text
691b7a5 Add administrator audit log persistence
```

Account creation service commit:

```text
49dc760 Add administrator account creation service
```

Account lifecycle commit:

```text
a9249d3 Add account lifecycle administration service
```

Account administration API commit:

```text
ac7fff5 Add administrator account management API
```

Account response fix commit:

```text
023fd67 Preserve account profile after creation
```

Public profile API commit:

```text
5845b0b Add public player profile API
```

Avatar profile implementation commit:

```text
3266bd4 Implement text and emoji avatar profiles
```

Room rules commit:

```text
c11dedc Add room rules validation
```

Room persistence commit:

```text
3f0fd88 Add room persistence models and migration
```

Room HTTP API commit:

```text
967fe22 Add room configuration HTTP API
```

Socket.IO authentication commit:

```text
006640a Wire authenticated Socket.IO connections
```

Waiting-room events commit:

```text
43009ab Add waiting room Socket.IO events
```

PokerKit adapter commit:

```text
30001ff Add PokerKit adapter contract
```

Match coordinator commit:

```text
d89063e Add multi-hand match coordinator
```

PokerKit side-pot contract commit:

```text
0d7450a Expand PokerKit side pot contracts
```

Deterministic settlement contract commit:

```text
fc12f07 Add deterministic poker settlement contracts
```

Showdown action commit:

```text
e59cf2c Add explicit showdown actions
```

Poker seating property commit:

```text
f80a39f Add poker seating property coverage
```

Match actor commit:

```text
8799b57 Add serialized match actor
```

Match state version commit:

```text
80fb987 Add match state versions
```

Poker snapshot commit:

```text
1ced8a4 Expose richer poker hand snapshots
```

Match actor lifecycle commit:

```text
184f303 Add match actor snapshot lifecycle
```

Match registry commit:

```text
575d457 Add active match registry
```

Realtime schema commit:

```text
7b7a19e Add realtime game event schemas
```

Socket.IO wiring commit:

```text
6d2c4ce Wire match registry into Socket.IO
```

Room and game events commit:

```text
3192374 Add room start and game realtime events
```

Odd-chip contract commit:

```text
51fff8d Cover odd chip split settlement
```

Deployment commit:

```text
63506fa Add Docker deployment roadmap
```

Deployment files:

- `backend/Dockerfile`: production image using Python 3.12, uv, locked production dependencies,
  a non-root user, and one Uvicorn worker.
- `deploy/compose.yml`: PostgreSQL, one-shot database migration, API, and Caddy services with
  ordered health checks and persistent volumes.
- `deploy/Caddyfile`: API and future Socket.IO reverse proxy.
- `deploy/.env.example`: local Compose settings and bootstrap administrator placeholders.
- `deploy/backup.sh` and `deploy/restore.sh`: compressed PostgreSQL backup and explicitly confirmed
  restore workflows.
- `deploy/README.md`: startup, shutdown, backup, restore, and log rotation instructions.
- `.github/workflows/backend.yml`: locked uv, formatting, Ruff, Pyright, and pytest checks.

Recent backend commits:

```text
ce7ca21 Persist realtime match history
0cd661b Add startup match recovery
49e2168 Settle ratings with completed matches
0ff4405 Persist player statistics
78f5c63 Replay ratings after match void
082dd0a Rebuild player statistics from history
ba1e603 Ensure rating records on startup
721ebe9 Persist per-pot settlement details
147b8d7 Scope rating replay to current batch
7e45900 Honor statistics opt-out in matches
9f6863a Add backend end-to-end coverage
fec5810 Add backup and deployment hardening
8e821a7 Add PostgreSQL settlement coverage
```

## Verification Status

Last successful checks:

```text
Ruff: passed
Pyright strict mode: passed
pytest: 145 passed
Alembic head: 0009_add_matches_played_to_stats
PostgreSQL integration test including avatar and room migrations: passed
Pillow: removed from project dependencies and uv.lock
Compose database migration: applied at 0009_add_matches_played_to_stats (head)
Administrator bootstrap: created and verified in the Compose database
HTTP login, current user, and logout through Caddy: passed
HTTP administrator create, disable, password reset, and restore through Caddy: passed
HTTP public player list, text/emoji avatar update, normalization, and invalid color rejection through
Caddy: passed
Room rules, persistence, HTTP, Socket.IO authentication, membership, and waiting-room event tests:
passed
PokerKit adapter and MatchCoordinator contract tests: passed
MatchActor serialization, duplicate command replay, and state-version tests: passed
PokerKit public/private snapshot and legal-action tests: passed
Active match registry and random-seat room lifecycle tests: passed
Room start, game action, snapshot request, stale-command, duplicate-command, and match reset
tests: passed
Finite action deadlines, disconnected-player fallback, SID rebinding, and snapshot recovery tests:
passed
Match history, privacy redaction, per-pot settlement, statistics rebuild/API, rating replay, and
backend end-to-end tests: passed
Room create/list/detail through Caddy: passed
Engine.IO polling handshake through Caddy: valid Origin accepted and invalid Origin rejected
with HTTP 400; Python AsyncClient smoke test not run because optional `aiohttp` is not installed
Compose configuration: parsed successfully
Backup/restore script syntax and destructive-operation guards: passed
Live compressed PostgreSQL backup and SHA-256 verification: passed
GitHub Actions backend quality workflow: added
API image rebuild with migration files and no Pillow: passed
PostgreSQL container: healthy
API container: healthy
Caddy container: running
GET /api/v1/health/live: 200
GET /api/v1/health/ready: 200
git diff --check: passed
```

Docker image construction, migration, and runtime health checks were verified from the user's WSL
terminal with Docker Desktop on 2026-07-16 using:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up -d postgres
docker compose --env-file deploy/.env -f deploy/compose.yml run --build --rm api alembic upgrade head
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d api caddy
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T api alembic current
curl -f http://localhost:8080/api/v1/health/live
curl -f http://localhost:8080/api/v1/health/ready
```

## Technology Decisions

- Backend: Python 3.12, FastAPI, Pydantic, python-socketio.
- Poker rules: PokerKit behind a project-owned adapter. No other module may import PokerKit.
- Persistence: PostgreSQL, SQLAlchemy 2 async, asyncpg, Alembic.
- Passwords: pwdlib with Argon2; passwords must never be stored in plaintext.
- Frontend: React 19.2, React Compiler 1, TypeScript 6, Vite 8/Rolldown, React Router 8
  Data Mode, TanStack Query 5, Zustand 5, Radix UI, selected shadcn/ui source components, and
  Tailwind CSS 4. TypeScript 7 is excluded until every required quality and contract-generation
  tool officially supports it.
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
│   ├── game_engine/
│   ├── realtime/
│   ├── rooms/
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
- Text/emoji avatar persistence and background color validation are implemented; client rendering
  remains responsible for centering and wrapping, and user-uploaded images are not supported.
- Record all administrator mutations in audit logs.

### 5. Room domain and real-time transport

- Room configuration persistence and validation for all explicit `Feature.md` limits are implemented.
- python-socketio Cookie/Origin authentication and one-active-connection replacement are implemented.
- Room create/list/detail REST endpoints and waiting-room `room:join`, `room:ready`, and `room:leave`
  events are implemented.
- Room start validation, random seat/button assignment, active match runtime registration, and
  room reset after match completion are implemented.
- Waiting-room host transfer and kick controls are implemented; invitations remain out of scope.
- One active Socket.IO connection per account is enforced in memory.
- Public room chat, quick messages, custom quick messages, and emote events are implemented.

### 6. PokerKit contract and match engine

- PokerKit is pinned and the project-owned adapter described in `Architecture.md` is implemented.
- Deterministic tests cover heads-up/three-player order, action authority, minimum raises, fold
  wins, short-stack side-pot flow, fixed public-board split pots, blind doubling, button movement,
  automatic all-in runout, fixed-hand completion, odd-chip assignment, explicit show/muck actions,
  and chip conservation.
- `MatchCoordinator` for winner-takes-all and fixed-hand-count modes is implemented.
- One queue/task per running match, duplicate command replay, and monotonic state versions are
  implemented in `MatchActor`.
- Socket.IO match start, public/private snapshots, action validation, request snapshots, and
  settlement events are implemented.
- Expand deterministic action/side-pot scenarios for four to eight players before production use
  beyond the current real-time contract coverage.
- Use one asyncio queue/task per running match so player and timeout commands are serialized.
- Do not continue to networking/UI work if PokerKit contract tests expose unresolved rule gaps.

### 7. Snapshots, timers, and reconnects

- State versions and idempotent command IDs are implemented.
- Separate public and player-private snapshots plus `game:request-snapshot` are implemented;
  spectator snapshots remain out of scope until spectator policy is finalized.
- Finite action timers and the 60-second disconnected-player fallback for unlimited rooms are
  implemented.
- Old connections are replaced on reconnect and a full current snapshot is available.
- Only completed hands/matches are persisted; incomplete matches are voided after process restart.

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
- Ensure statistics can be rebuilt from persisted actions and queried publicly with derived rates.

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
- Database backup/restore scripts, log rotation, health checks, CI, and backend end-to-end coverage
  are implemented.
- Load test 10 concurrent clients on a 2 vCPU / 4GB environment.

## Open Product Decisions

The following remain unresolved in `Feature.md` and must not be silently invented when they affect
behavior materially:

- Spectator capacity and whether spectators may join mid-match.
- Mid-match player joining, rebuying, and voluntary seat-leave behavior.
- Nickname change frequency and account/history retention periods.

Implement surrounding work first when possible. Before finalizing one of these behaviors, obtain a
user decision and update `Feature.md` together with the implementation.
