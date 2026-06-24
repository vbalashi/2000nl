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

## Related Workspaces

2000NL is tracked with AudioFilms and Pontix in the shared GitHub Project
`AudioFilms / 2000NL Roadmap`:
https://github.com/users/vbalashi/projects/2.

Before changing behavior that crosses dictionary lookup, platform translation,
connected-client auth, source provenance, AudioFilms YouTube practice, or Pontix
selection flows, read the coordination map:
`/Users/khrustal/dev/docs/project-map/2000nl-audiofilms-translate-extension.md`.

Related local workspaces:

- `/Users/khrustal/dev/audiofilms` - AudioFilms app, subtitle/practice backend,
  and YouTube shadowing extension.
- `/Users/khrustal/dev/translate-extension` - Pontix Chrome extension.

Keep 2000NL as the owner of platform APIs, dictionary data, user dictionaries,
card identity, scheduling/progress state, and source/provenance storage. Treat
AudioFilms and Pontix as connected clients unless a local document explicitly
promotes a boundary change.

## Canonical Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) - top-level system boundaries and safe change patterns.
- [docs/architecture/post-provenance-review/platform-engineering-principles.md](./docs/architecture/post-provenance-review/platform-engineering-principles.md) - required guardrail for substantial Platform, dictionary, provenance, learning-state, external-client, and refactor work.
- [docs/intent/index.md](./docs/intent/index.md) - product and workflow intent.
- [docs/tech-debt/index.md](./docs/tech-debt/index.md) - known structural debt.
- [docs/runbooks](./docs/runbooks) - operational notes for Supabase auth, production debugging, and audio/TTS workflows.
- [packages/docs/README.md](./packages/docs/README.md) - deeper data-flow and contract docs.

## Working Rules

- Before substantial code changes, new features, contract changes, or refactors,
  read the platform engineering principles and decide the owning layer/module.
  Do not grow a broad file when the change belongs in a domain service, helper,
  schema, migration/RPC, or documented projection.
- Prefer the existing runtime boundaries: UI in `apps/ui`, scheduler logic in Postgres migrations/RPCs under `db`, ingestion in `packages/ingestion`.
- Treat `apps/api` as aspirational unless you verify code exists for the path you intend to change.
- Keep production-sensitive auth, Supabase, and service-role workflows server-side only.
- When changing DB schema or FSRS behavior, validate both SQL-side behavior and the UI/tests that depend on it.
- When decomposing broad but working code, add characterization tests for the
  current request/response shapes, error codes, side effects, DB/RPC behavior,
  and privacy/redaction behavior before splitting by domain.
- Do not scatter new operational notes in random docs; add stable system guidance to `ARCHITECTURE.md`, intent to `docs/intent`, and runbook/debug material to `docs/`.

## Validation Commands

Run the narrowest relevant checks for the files you touched.

- UI dev server: `cd apps/ui && npm run dev`
- UI typecheck: `cd apps/ui && npm run typecheck`
- UI lint: `cd apps/ui && npm run lint`
- UI unit/component tests: `cd apps/ui && npm test`
- UI e2e tests: `cd apps/ui && npm run test:e2e`
- FSRS parity/RPC tests: `cd apps/ui && FSRS_TEST_DB_URL="$SUPABASE_DB_URL" npm test -- tests/fsrs/*.test.ts`
- Docker image build for UI: `docker compose build ui`
- Supabase psql access: `psql "$SUPABASE_DB_URL"`

## Browser QA Notes

For local UI browser QA, prefer the `nl-local-ui-qa` / `2000nl-local-ui-qa`
skill and the dev-login URL on the same origin as the UI server.

Use `3100` as the canonical local QA port. If `3100` is already listening,
check `curl -sS 'http://localhost:3100/api/health?deep=1'` before starting any
new UI server. If health is `ok` with `database.target: local`, reuse the
existing server. If the existing 3100 server is a broken `apps/ui` Next dev
process from this repo, restart it instead of starting `3101+`. Use alternate
ports only when another active agent or user process legitimately owns `3100`,
and stop temporary `3101+` UI processes before the final report. Use
`scripts/ui-local-qa-cleanup.sh` to clean temporary QA ports and Chrome DevTools
MCP processes without stopping `3100`; use `--include-3100` only when you intend
to restart the canonical server.

Do not conflate browser tooling failures:

- Codex in-app Browser / Browser plugin (`iab`) is separate from Chrome
  DevTools MCP.
- Chrome DevTools MCP may fail because its shared profile is already locked at
  `~/.cache/chrome-devtools-mcp/chrome-profile`.
- If Chrome DevTools MCP says the browser is already running for that profile,
  try the Browser plugin / `iab` path before falling back to standalone
  Playwright.
- If no other agent is using Chrome DevTools MCP, stale MCP processes can be
  checked with `pgrep -fl 'chrome-devtools-mcp|chrome-profile'` and cleared with
  `pkill -f 'chrome-devtools-mcp' || true`.
- When using Playwright fallback, report the exact blocked surface instead of
  saying the whole in-app browser is blocked.

## Change Routing

- UI copy, layout, auth UX, and browser automation helpers: start in `apps/ui` and `docs/`.
- Scheduler behavior, review state, policies, or RPCs: start in `db/migrations` and `apps/ui/tests/fsrs`.
- Data import or dictionary shape issues: start in `packages/ingestion`, `packages/scraper`, and `packages/shared`.
- Production login, TTS, and premium-provider troubleshooting: check the runbooks in `docs/`.
