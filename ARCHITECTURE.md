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

## Safe Change Patterns

- UI-only changes: validate with `npm run lint` and relevant UI tests in `apps/ui`.
- FSRS or DB changes: validate migrations plus `apps/ui/tests/fsrs/*.test.ts`; avoid production DBs for migration-driven tests.
- Auth/provider changes: confirm required env vars, callback URLs, and service-role boundaries remain server-side.
- Ingestion/scraper changes: preserve artifact/schema contracts and document any new operational steps.

## Known Architectural Constraints

- Documentation still contains some pre-normalization assumptions. In particular, `apps/api` is documented in some places more strongly than it exists in practice.
- Operational knowledge is split between root docs, `docs/`, and `packages/docs/`; this refactor establishes root `AGENTS.md` and `ARCHITECTURE.md` as the canonical starting points.
