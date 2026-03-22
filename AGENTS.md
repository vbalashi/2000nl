# AGENTS.md

This is the canonical agent entrypoint for the 2000nl monorepo. Use it to orient quickly, choose the right validation path, and avoid drifting across UI, DB, ingestion, and operational work.

## Repo Map

- `apps/ui` - active Next.js application, auth flows, training UX, API routes, Playwright/Vitest tests.
- `apps/api` - planned backend service boundary; currently mostly a placeholder and should not be treated as the primary runtime.
- `db` - canonical schema, migrations, seeds, and DB-side FSRS functions/RPCs.
- `packages/ingestion` - import and normalization scripts for dictionary data.
- `packages/scraper` - source-specific scraping adapters.
- `packages/shared` - shared schemas, types, and card-type definitions.
- `packages/docs` - lower-level contract and data-model docs.
- `docs` - runbooks, feature notes, intent docs, exec plans, and debt tracking.
- `ops` - deployment and infrastructure placeholders.

## Canonical Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) - top-level system boundaries and safe change patterns.
- [docs/intent/index.md](./docs/intent/index.md) - product and workflow intent.
- [docs/tech-debt/index.md](./docs/tech-debt/index.md) - known structural debt.
- [agents.md](./agents.md) - operational notes for Supabase, auth persistence, and debugging.
- [packages/docs/README.md](./packages/docs/README.md) - deeper data-flow and contract docs.

## Working Rules

- Prefer the existing runtime boundaries: UI in `apps/ui`, scheduler logic in Postgres migrations/RPCs under `db`, ingestion in `packages/ingestion`.
- Treat `apps/api` as aspirational unless you verify code exists for the path you intend to change.
- Keep production-sensitive auth, Supabase, and service-role workflows server-side only.
- When changing DB schema or FSRS behavior, validate both SQL-side behavior and the UI/tests that depend on it.
- Do not scatter new operational notes in random docs; add stable system guidance to `ARCHITECTURE.md`, intent to `docs/intent`, and runbook/debug material to `docs/`.

## Validation Commands

Run the narrowest relevant checks for the files you touched.

- UI dev server: `cd apps/ui && npm run dev`
- UI lint: `cd apps/ui && npm run lint`
- UI unit/component tests: `cd apps/ui && npm test`
- UI e2e tests: `cd apps/ui && npm run test:e2e`
- FSRS parity/RPC tests: `cd apps/ui && FSRS_TEST_DB_URL="$SUPABASE_DB_URL" npm test -- tests/fsrs/*.test.ts`
- Docker image build for UI: `docker compose build ui`
- Supabase psql access: `psql "$SUPABASE_DB_URL"`

## Change Routing

- UI copy, layout, auth UX, and browser automation helpers: start in `apps/ui` and `docs/`.
- Scheduler behavior, review state, policies, or RPCs: start in `db/migrations` and `apps/ui/tests/fsrs`.
- Data import or dictionary shape issues: start in `packages/ingestion`, `packages/scraper`, and `packages/shared`.
- Production login, TTS, and premium-provider troubleshooting: check the runbooks in `docs/`.
