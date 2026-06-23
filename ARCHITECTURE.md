# ARCHITECTURE.md

## System Shape

2000nl is a mixed application/data repo centered on one active product runtime: the Next.js app in `apps/ui`, backed by Supabase/Postgres. The learning scheduler is implemented primarily in Postgres functions and migrations, not in an independent backend service.

Primary flow:

1. Scrapers collect dictionary data.
2. Ingestion validates and normalizes it.
3. Postgres stores canonical content plus user progress and FSRS state.
4. `apps/ui` serves the web experience and calls Supabase/RPC endpoints.
5. Operational scripts, CI, and deployment glue support the runtime.

## Boundaries

### `apps/ui`

The active application surface. Owns user-facing flows, auth callbacks, training interactions, provider integrations, and automated UI tests.

### `db`

The source of truth for schema, review-state persistence, and FSRS-related functions/RPCs. Any change to review semantics or user progress should usually start here.

Postgres/RPC is also the trust boundary for dictionary access, scheduler/card
selection, review mutations, user-list membership, user-owned dictionary
changes, learning preferences that affect scheduling, and platform-facing
lookup/action contracts. These paths must not rely on frontend-owned table
mutations.

`user_settings` intentionally contains two classes of settings:

- Learning preferences that affect scheduling/training semantics. These are
  accessed through RPCs such as `get_learning_preferences` and
  `update_learning_preferences`.
- App-local UI preferences such as theme, sidebar pinning, translation language,
  onboarding JSON, and audio quality. The first-party `apps/ui` service may
  read/write these columns directly under Supabase RLS because they are not a
  dictionary/platform boundary. If any of these settings becomes shared across
  external clients or starts affecting scheduler semantics, move it behind an
  explicit RPC/action boundary first.

### `packages/ingestion`

Owns import pipelines and normalization from external dictionary artifacts into the relational model.

### `packages/scraper`

Owns source-specific data extraction. Output must remain compatible with ingestion contracts.

### `packages/shared`

Owns shared schemas, types, and card-type definitions used across import and UI flows.

### `apps/api`

Reserved service boundary, but currently not the primary runtime. Do not assume a live API layer exists unless the code you need is present.

## Environment Model

- Local dev: Next.js app from `apps/ui`, local env files, optional local/docker services, optional direct Supabase access.
- CI: targeted checks for DB drift, FSRS parity/RPC behavior, and deployment flows.
- Production: web UI at `https://2000.dilum.io`, Supabase-backed auth/data, deployment and operational workflows documented in `docs/`.

DB URL aliases are intentionally linked. `SUPABASE_DB_URL` is the preferred
name for Supabase psql access, `DATABASE_URL` is accepted by DB helpers and can
be loaded from repo `.env.local`, `FSRS_TEST_DB_URL` is the test-specific alias
used by `apps/ui/tests/fsrs`, and `LOCAL_SUPABASE_DB_URL` overrides the local
Docker Supabase URL. For local DB/RPC checks, prefer
`scripts/db-local-supabase.sh test-fsrs`; for ad-hoc SQL, use
`db/scripts/psql_supabase.sh`.

## Safe Change Patterns

- UI-only changes: validate with `npm run lint` and relevant UI tests in `apps/ui`.
- FSRS or DB changes: validate migrations plus `apps/ui/tests/fsrs/*.test.ts`; prefer the local Supabase Docker harness in `docs/runbooks/local-supabase-test-env.md`, and avoid production DBs for migration-driven tests.
- Auth/provider changes: confirm required env vars, callback URLs, and service-role boundaries remain server-side.
- Ingestion/scraper changes: preserve artifact/schema contracts and document any new operational steps.

## Known Architectural Constraints

- Historical reports and archived migrations may describe older normalized-table or `apps/api` assumptions. Treat live docs plus `db/migrations` as current, and treat `reports/` / `db/migrations/archive/` as snapshots.
- Operational knowledge is still split between root docs, `docs/`, and `packages/docs/`; root `AGENTS.md` and `ARCHITECTURE.md` are the canonical starting points.
