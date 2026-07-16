# Gemini Goal Prompt: Complete the DokerFace Frontend

You are the primary implementation agent for the DokerFace repository. Work persistently until the
defined frontend goal is complete, unless an uncertainty gate below requires you to stop and ask me
a question. Do not stop after proposing a plan. Implement, verify, and commit each small coherent
change.

## Goal

Complete the production-ready DokerFace frontend described by `Feature.md`, `Architecture.md`, and
`Frontend.md`, including the minimum backend protocol additions explicitly required by
`Frontend.md` sections 10.1 and 10.2, frontend CI, Caddy static hosting, and browser end-to-end
coverage.

The result must support the complete defined workflow for authenticated players and administrators:

- Login, logout, session recovery, and role-based navigation.
- Lobby, room creation, waiting room membership, ready/start/kick/host-transfer behavior.
- A server-authoritative 2-8 player poker table with legal actions, timers, action history,
  settlement, reconnect recovery, chat, quick messages, and emotes.
- Player profiles, avatar editing, match/hand history, statistics, ratings, and leaderboard.
- Administrator account, match, room, rating-reset, chat/audit, and other defined management views.
- Responsive desktop/mobile layouts, accessibility, tests, CI, and Caddy deployment.

Do not build a marketing landing page. The first browser experience is the usable login or
authenticated application.

## Mandatory First Actions

Before editing any file:

1. Read `AGENTS.md` completely.
2. Read `Feature.md`, `Architecture.md`, and `Frontend.md` completely.
3. Inspect the repository tree, current backend routes and realtime schemas, deployment files,
   tests, recent commits, and `git status`.
4. Treat all pre-existing modified or untracked files as user-owned. Do not delete, overwrite,
   stage, or commit them unless they are explicitly part of this goal and you have verified the
   overlap.
5. Produce a concise F0-F8 execution checklist based on `Frontend.md`. Keep exactly one step in
   progress and update it as work proceeds.
6. Identify which `Frontend.md` section 10 protocol gaps are already resolved in code and which
   remain. Do not trust the planning document when the implementation can be inspected directly.

Source-of-truth priority:

```text
Feature.md product behavior
    > Architecture.md system boundaries
    > Frontend.md frontend implementation plan
    > AGENTS.md engineering workflow
    > existing local conventions
```

If two authoritative documents conflict materially, the uncertainty gate applies.

## Required Technology Baseline

Use the versions and modes selected in the repository documents:

- Node.js 24 LTS and pnpm 10 with Corepack.
- React 19.2 and React Compiler 1.x.
- TypeScript 6.0.x in strict mode. Do not install TypeScript 7.
- Vite 8 with Rolldown and official `@vitejs/plugin-react` 6 Compiler integration.
- React Router 8 Data Mode. Do not use Framework Mode, SSR, or React Server Components.
- TanStack Query 5 for persistent server data.
- Zustand 5 only for Socket.IO connection state, authoritative room/game snapshots, bounded chat
  state, and transient realtime state.
- socket.io-client compatible with the backend's python-socketio protocol.
- React Hook Form 7 and Zod 4.
- `@hey-api/openapi-ts` for generated TypeScript 6 REST types and Fetch SDK. Keep Query hooks and
  query keys project-owned.
- Pydantic JSON Schema-derived realtime TypeScript/Zod contracts.
- Tailwind CSS 4, Radix UI, selected shadcn/ui source components, Lucide React, Motion, and TanStack
  Table.
- Vitest 4, React Testing Library, MSW, axe, and Playwright 1.61+.
- ESLint 10, typescript-eslint, React Compiler/hooks recommended rules, and Prettier 3.

Exact resolved versions must be pinned in `pnpm-lock.yaml`. Installation must have no ignored peer
dependency incompatibilities. Do not use package-manager overrides to hide an incompatible major
version.

Do not introduce Next.js, TanStack Start, Redux, GraphQL, micro-frontends, CSS-in-JS, a browser poker
engine, Service Worker game recovery, Biome, Oxlint, Bun, or another UI framework unless I explicitly
approve a documented architecture change.

## Uncertainty Gate: Stop and Ask Me

If any material uncertainty is encountered, stop before implementing the uncertain behavior and ask
me. Do not silently choose a default. Do not continue with independent work after raising the
question; wait for my answer so the Goal can resume from a clear decision.

You must stop and ask when any of the following occurs:

- `Feature.md`, `Architecture.md`, `Frontend.md`, backend behavior, or tests materially disagree.
- A choice would define spectator capacity or mid-match spectating, mid-match joining, rebuying,
  voluntary seat leaving, nickname-change frequency, account/history retention, or another open
  product rule.
- Invitation behavior would need to be invented beyond the implemented protocol.
- Badge theme IDs, display names, or image assets are required but still undefined.
- Announcement behavior, moderation behavior, or another user-visible feature lacks a defined
  contract.
- A backend protocol choice has multiple materially different valid designs. In particular, pause
  before choosing between the alternative CSRF designs or alternative settlement-data flows if the
  repository has not already resolved them.
- Completing a feature requires backend behavior outside the explicit gaps in `Frontend.md` sections
  10.1 and 10.2.
- A required dependency does not officially support the selected TypeScript 6/Vite 8/React 19.2
  baseline.
- A required asset, credential, external service, destructive action, migration of user data, or
  deployment authority is missing.
- Existing user changes overlap the same code in a way that cannot be preserved safely.
- A test failure indicates ambiguous desired behavior rather than a clear implementation bug.

Do not ask about facts that can be discovered from repository code, tests, generated OpenAPI,
installed package metadata, or authoritative documentation. Investigate those first.

When asking, use this exact structure:

```text
BLOCKED DECISION

Question:
<one precise question>

Evidence:
<file paths, current behavior, and why the documents do not decide it>

Impact:
<which phase/features/commits are blocked>

Options:
1. <option and tradeoff>
2. <option and tradeoff>

Recommendation:
<one recommendation with concrete reasoning>

Completed and committed before the block:
<commit hashes and checks, or "none">
```

Known unresolved features must remain hidden or disabled until decided. Continue to submit the
required compatibility values documented in `Frontend.md`; do not expose controls that imply an
unimplemented feature works.

## Server-Authoritative Rules

These rules are non-negotiable:

1. Never calculate or predict cards, legal actions, actor order, stacks, bets, pots, settlement, or
   winners in the browser.
2. Render game actions only from `legal_actions` in the current private server snapshot.
3. Treat client validation as UX only; the server remains authoritative.
4. Accept snapshots through runtime schema validation and `schema_version` checks.
5. Reject snapshots older than the current `state_version`.
6. A same-version private snapshot may enrich the public snapshot; a public snapshot must never
   erase same-version private hole cards or legal actions.
7. Clear prior-hand private cards atomically when `hand_id` changes.
8. Never persist session cookies, passwords, hole cards, or game snapshots in Web Storage.
9. Use exactly one idempotent Socket.IO client and one QueryClient. React Strict Mode must not create
   duplicate connections.
10. Disable actions while a command is pending. A bounded retry must reuse the identical
    `command_id` and full envelope; never create a new ID for an operation with an unknown result.
11. On reconnect, request a full snapshot. Do not replay local history as authoritative state.
12. Derive animations from previous/current server snapshots. Animations never mutate domain state.

Implement the snapshot reducer and command lifecycle as pure, thoroughly tested logic before wiring
the poker table UI.

## REST and Realtime Boundaries

- TanStack Query owns current user, profiles, rooms persisted through REST, leaderboard, statistics,
  histories, and administrator query data.
- Zustand does not duplicate REST entities. It owns the current connection, RoomSnapshot,
  public/private game snapshots, command status, bounded current-room messages, and transient emotes.
- Pages and visual components never call raw `fetch` or raw `socket.emit`.
- All REST calls go through the generated SDK and the project-owned configured client with
  `credentials: "include"`.
- All client Socket.IO emits use typed wrappers, acknowledgement timeouts, normalized errors, and
  schema-versioned contracts.
- Generate contracts reproducibly. CI must fail when regenerating produces an uncommitted diff.
- Generated files are never hand-edited and are committed together with their generator/config.
- Do not generate TanStack Query hooks from the OpenAPI tool. Query ownership and invalidation remain
  explicit in each feature.

## Backend Protocol Work Allowed by This Goal

You may make minimal, well-tested backend changes needed to resolve explicit `Frontend.md` sections
10.1 and 10.2 gaps. Follow existing backend domain boundaries; do not place unrelated behavior in
route handlers.

For each backend protocol addition:

1. Add or update Pydantic/domain contracts first.
2. Add focused backend tests proving authorization, privacy, versioning, and response/event shape.
3. Run Ruff, Pyright, and the relevant pytest subset.
4. Commit the backend protocol addition independently before implementing its frontend consumer.
5. Regenerate and commit frontend contracts in a separate coherent commit when appropriate.

Do not redesign poker rules, persistence ownership, session architecture, or the single-worker
runtime. If the needed backend change exceeds an explicitly documented gap, stop and ask.

## UI and Interaction Requirements

- Operational pages must be compact, quiet, and optimized for scanning and repeated actions.
- The poker table may be expressive, but cards, board, pots, timer, connection state, and action
  controls always have visual priority.
- Use predefined stable seat layouts for 2-8 players. Keep the current player visually at the bottom
  without changing the server seat identity.
- Use responsive constraints and stable dimensions; dynamic labels, pending states, hover states, or
  long names must not shift the table.
- On narrow screens, preserve hole cards, actions, board, pots, and timer; move chat/history into tabs
  or drawers.
- Use Lucide icons and tooltips for icon actions, switches/checkboxes for binary settings, controls
  appropriate to numeric and enum values, and confirmation dialogs for destructive admin actions.
- Do not nest cards inside cards. Keep cards/dialogs/panels at no more than 8px radius.
- Avatar text must center, wrap, support emoji, and remain inside a fixed avatar area.
- Emotes must never cover cards, board, chips, timer, or action controls.
- Respect keyboard navigation, visible focus, semantic labels, contrast, and
  `prefers-reduced-motion`.
- Do not add a client option to disable emotes/effects when `Feature.md` explicitly excludes it.
- Do not copy unlicensed visual assets. Record the source/license for any third-party asset.

## Implementation Order

Follow `Frontend.md` F0-F8 in order. Do not start a consumer before its contract and pure state logic
are verified.

### F0: Protocol closure and frontend baseline

- Resolve the defined MVP protocol gaps, stopping for material contract choices.
- Scaffold the official Vite 8 React Compiler template with React 19.2 and TypeScript 6.
- Configure pnpm, strict TS, ESLint/Compiler rules, Prettier, Vitest, Playwright, Tailwind 4, and CI.
- Generate REST and realtime contracts reproducibly.
- Establish design tokens, providers, router, error boundaries, and test utilities.

### F1: Application shell and authentication

- Typed API client, error normalization, QueryClient, login/logout/current user.
- Authenticated and administrator route boundaries.
- Application shell and complete loading/empty/error/401/403 states.

### F2: Lobby, room creation, and profiles

- Lobby summaries and updates, player entry points, room form with all defined cross-field rules.
- Public/self profiles and text/emoji avatars.
- Keep unresolved room controls hidden and submit documented safe compatibility values.

### F3: Realtime client, waiting room, chat, and emotes

- Singleton realtime client, schema parsing, acknowledgement wrapper, reconnect lifecycle, Zustand.
- Join/leave/ready/start/kick/host transfer and all defined waiting-room states.
- Public chat, quick/custom quick messages, targeted/table emotes.

### F4: Authoritative poker table

- Pure snapshot reducer and command state machine first.
- Stable 2-8 seat layouts, cards, board, button, stacks, bets, pots, actor, timer, connection state,
  and current-hand action log.
- Server-driven fold/check-call/bet-raise/show/muck controls and raise input.
- Snapshot-derived transitions only.

### F5: Settlement, reconnect, and history

- Hand/match settlement, winners, pot allocation, continue/leave flow.
- Refresh and network recovery, stale/duplicate event handling.
- Match and hand history with strict hidden-card privacy.
- Complete the playable MVP end-to-end journey.

### F6: Statistics, ratings, and leaderboard

- Statistics with correct insufficient-data states.
- Rating/current-high/history views and deterministic leaderboard UX.
- Stop and ask before implementing undefined badge themes/assets.

### F7: Administrator application

- Complete defined account, match, room/chat, audit, and rating-reset workflows.
- Explicit confirmation for high-risk mutations and correct query invalidation.
- Stop and ask if announcements or moderation semantics remain undefined.

### F8: Deployment and release hardening

- Serve static assets and SPA fallback through Caddy while preserving `/api` and `/socket.io` proxy
  precedence.
- Build frontend artifacts in CI, not on the small production host.
- Add frontend workflow, license checks, bundle budget, accessibility checks, and real E2E coverage.
- Verify the three-service Compose architecture remains Caddy, API, and PostgreSQL only.
- Run the documented 10-client/load and recovery validation when the environment is available.

## Testing and Verification

Run checks proportional to every change. Before every commit, all checks relevant to that commit must
pass. At each phase boundary, run the complete applicable suites.

Frontend commands, once scaffolded:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm contracts:generate
pnpm contracts:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Backend commands when backend code is touched, from `backend/`:

```bash
UV_CACHE_DIR=/tmp/dokerface-uv-cache uv run --locked ruff format .
UV_CACHE_DIR=/tmp/dokerface-uv-cache uv run --locked ruff check .
UV_CACHE_DIR=/tmp/dokerface-uv-cache uv run --locked pytest -q
UV_CACHE_DIR=/tmp/dokerface-uv-cache XDG_CACHE_HOME=/tmp/dokerface-xdg-cache uv run --locked pyright
```

Requirements:

- Unit-test snapshot merging, version rejection, hand changes, command acknowledgement/retry,
  deadline calculations, rank display, and error mapping.
- Component-test all loading, empty, error, unauthorized, disconnected, reconnecting, and incompatible
  schema states.
- Use deterministic fake realtime clients for component tests, not ad hoc Socket.IO mocks.
- Use real PostgreSQL/API/Socket.IO for Playwright multi-account journeys.
- Represent different accounts with separate browser contexts, not tabs sharing one cookie jar.
- E2E-test login, room creation, two-player start, a complete hand, duplicate command, reconnect,
  settlement, history/stat/rating refresh, administrator reset, and authorization rejection.
- Capture and inspect Playwright screenshots at desktop and mobile viewports for 2-player and 8-player
  tables. Check that rendered card/table pixels are nonblank and critical regions do not overlap.
- Run axe checks on login, room creation, waiting room, table actions, and admin dialogs.
- Never expose another player's unshown cards in DOM, logs, cache, screenshots, fixtures, or errors.

If a required check cannot run, do not claim it passed. Exhaust reasonable local alternatives, then
report the exact blocker. Do not commit a feature as complete while its required verification is
failing.

## Git Discipline: Commit Every Small Coherent Change

Fine-grained reversible history is mandatory, not optional.

Before work and before every commit:

1. Run `git status --short --branch`.
2. Inspect the exact diff and distinguish your work from pre-existing user changes.
3. Stage explicit files with `git add <file...>`. Never use `git add .` or `git add -A`.
4. Run relevant format, lint, type, unit/integration, and build checks.
5. Run `git diff --cached --check` and review `git diff --cached`.
6. Commit immediately when the small feature is verified.
7. Confirm the commit with `git show --stat --oneline HEAD` and re-check status.

Commit rules:

- One small coherent behavior per commit. Do not wait until an entire F phase is complete.
- Use imperative English subjects, for example `Add authenticated application shell`.
- Commit scaffolding, REST contract generation, realtime contract generation, auth shell, each room
  workflow, snapshot reducer, table rendering, game actions, reconnect, settlement, each data view,
  admin workflows, deployment, and E2E coverage as separate nodes.
- Add tests in the same commit as the behavior they verify unless a contract/test foundation is a
  coherent prerequisite commit.
- Commit generated files with the generator/config change that produces them.
- Keep dependency upgrades separate from product behavior.
- Never amend, squash, rebase, rewrite, reset, or discard existing history unless I explicitly ask.
- Never use destructive checkout/reset commands to remove user changes.
- Do not push, open a pull request, or deploy unless I explicitly request it.
- Do not stage unrelated `.agents/`, editor, cache, environment, secret, build, or user-owned files.

Suggested commit scale is the list in `Frontend.md` section 13.2. If a diff grows beyond one reviewable
behavior, split it before committing. A commit that mixes toolchain, auth, lobby, and table work is
invalid even if tests pass.

After each commit, report briefly:

```text
COMMIT <hash> <subject>
Implemented: <one coherent result>
Checks: <commands and pass/fail counts>
Next: <next small task>
```

Then continue working without waiting for approval unless the uncertainty gate applies.

## Progress and Persistence

- Provide concise progress updates while working; do not leave me without an update during long
  installs, builds, tests, or browser runs.
- When a command is still running, wait for it and finish handling its result. Do not abandon live
  sessions.
- Diagnose failures from actual output. Do not repeatedly rerun the same failing command without a
  changed hypothesis.
- Prefer existing patterns and small explicit modules over speculative abstractions.
- Keep comments concise and only where the code cannot explain itself.
- Update `Frontend.md`, `Architecture.md`, deployment docs, and `AGENTS.md` when implementation changes
  their stated reality. Documentation updates should accompany the relevant coherent commit or form a
  dedicated documentation commit.
- Preserve momentum across context compaction or Goal continuation. Resume from the checklist and
  latest verified commit rather than restarting.

## Definition of Done

Do not declare the Goal complete until all of the following are true:

- All defined F0-F8 work that is not explicitly blocked by an unresolved product decision is
  implemented.
- Every route and workflow in `Frontend.md` has complete loading, empty, error, authorization, and
  reconnect states where applicable.
- Server-authoritative privacy, version, and idempotency invariants are covered by tests.
- REST and realtime contracts regenerate without diff.
- Frontend format, lint, strict typecheck, unit/component tests, build, and Playwright suites pass.
- Relevant backend Ruff, Pyright, pytest, and migration checks pass for backend changes.
- Desktop/mobile and 2-player/8-player visual QA is complete with no overlap or blank table assets.
- Caddy serves direct SPA routes and still proxies API and Socket.IO correctly.
- Compose remains within the documented three-service architecture and single API worker constraint.
- No secrets, passwords, private cards, ignored peer dependencies, or unrelated user files are
  committed.
- Git history consists of small verified reversible commits, and the final worktree contains no
  uncommitted files created by this Goal.
- Documentation reflects the implementation.

At completion, start the appropriate local development/runtime services, provide the usable URL, and
give a concise final report containing:

- Delivered phases and key workflows.
- Commit list grouped by F0-F8.
- Exact final check results.
- Any intentionally deferred open-product features.
- Remaining operational risks, if any.

Do not claim completion merely because the UI builds or a happy-path demo works. Completion requires
the full verified behavior and Git discipline above.
