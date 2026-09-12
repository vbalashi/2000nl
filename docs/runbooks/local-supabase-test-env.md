# Local Supabase Test Environment

Use this for migration and DB-contract checks before touching a staging or production Supabase project. It runs real Supabase services in Docker, so migrations see `auth.users`, `auth.uid()`, `anon`, `authenticated`, RLS, PostgREST, and Studio instead of a plain Postgres shim.

## Install

```bash
brew install supabase/tap/supabase
brew install libpq
brew link --force libpq
```

Use Docker Desktop, or Colima:

```bash
brew install colima docker docker-compose
colima start --cpu 4 --memory 8
```

## Choose the database by purpose

The canonical local Supabase database is disposable app/browser QA state. SQL,
FSRS, and ingestion suites use unique temporary local databases. Staging and
production are only for explicit deployment gates and bounded postflight smoke;
never run migration-driven tests there.

Use the read-only check only when intentionally retaining a populated local or
production-shaped environment with managed deployment receipts:

```bash
scripts/db-local-supabase.sh check
scripts/ui-local-dev.sh --port 3100
```

`check` never starts services, applies migrations, imports, or resets. It reports
content/progress counts, verifies managed migration receipts against the current
manifest, and runs existing platform/postflight checks with read-only sessions.
If the stack is stopped, use `start` and repeat `check`.

A matching health version alone does not prove the schema was verified. Missing
ledger entries require the reviewed migration gate described in
[nuc-db-contract-deploy.md](nuc-db-contract-deploy.md), pointed explicitly at the
local database. That gate also requires its dedicated QA principal for the read
probe. Never manually insert a contract version or receipt to make health green.

A fresh `bootstrap.sql` database intentionally has no deployment receipts. Use
`probe` for that state; failure of `check` is not evidence that the bootstrap is
invalid.

If `check` fails, preserve data only when it is intentional or needed for a
comparison. The canonical local QA database may be rebuilt from checked-in
migrations instead.
Bootstrap includes all numbered migrations (CI checks coverage), but is not a
production snapshot and does not create verified deployment receipts. Dictionary
JSON import restores source content, not user histories, generated entries,
translation caches or all forms. Compare dataset provenance/counts separately;
passing schema probes does not prove identical production content or ordering.
Search index backfill is also separate from dictionary import.

## Fresh disposable database only

From the repo root:

```bash
scripts/db-local-supabase.sh start
scripts/db-local-supabase.sh apply
scripts/db-local-supabase.sh probe
```

For fast browser QA, load the committed small fixture and re-run probes:

```bash
scripts/db-local-supabase.sh fixture
```

Run migration-driven suites in their own disposable databases:

```bash
scripts/db-local-supabase.sh test-fsrs
scripts/bootstrap-worktree.sh --install --ingestion
scripts/db-local-supabase.sh test-ingestion
```

The `env` command exposes the canonical local app/QA database without making it
the default FSRS test target:

- `LOCAL_SUPABASE_DB_URL` optionally overrides the local Docker Supabase DB URL.
- `SUPABASE_DB_URL` and `DATABASE_URL` are exported to the selected local DB URL.
- `FSRS_TEST_DB_URL` is deliberately not exported; `test-fsrs` supplies its
  unique disposable database directly to the test process.
- `apps/ui/tests/fsrs` accepts only the explicit `FSRS_TEST_DB_URL`; use the
  wrapper for the normal migration-driven suite.
- `db/scripts/psql_supabase.sh` reads `SUPABASE_DB_URL` or `DATABASE_URL` from
  env, then falls back to repo `.env.local`.

For the disposable canonical QA database, run the whole local harness:

```bash
scripts/db-local-supabase.sh all --confirm-reset
```

`all` resets the canonical local Supabase database, applies bootstrap, runs
probes, runs FSRS and ingestion tests in separate temporary databases, loads the
small deterministic QA fixture, and probes again. Temporary databases are
removed after pass, failure, or interruption. It never starts a full dictionary
import.

Full dictionary import is an explicit operation. In a worktree, the default
source directory is discovered from the reference checkout when ignored source
data is not present locally:

```bash
scripts/bootstrap-worktree.sh --install --ingestion
scripts/db-local-supabase.sh import
scripts/db-local-supabase.sh probe
```

Full-corpus import performance is tracked in #397; it is not required for the
small #393 browser acceptance fixture.

Unacknowledged `all` and `reset` stop before any service/database command.
Local wrapper commands accept only loopback PostgreSQL URIs with an explicit port and without connection
overrides. Reset requires port 54322 and database `postgres`, matching the
checked-in Supabase configuration. Do not use this wrapper for remote staging.

## Useful URLs And Env

```bash
scripts/db-local-supabase.sh status
scripts/db-local-supabase.sh env
```

Default local endpoints:

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

For UI development, prefer the wrapper so `.env.local` production Supabase values
do not leak into local smoke tests:

```bash
scripts/ui-local-dev.sh --port 3100
```

Then open the dev-login helper on the same origin:

```text
http://localhost:3100/dev/test-login?redirectTo=/
```

The wrapper reads `supabase status -o env`, exports local `NEXT_PUBLIC_SUPABASE_*`
and server-side `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` values for
that UI process only, and leaves `.env.local` unchanged.

The same runtime injection can be used for a local production build without
copying an env file into the worktree:

```bash
(
  eval "$(scripts/db-local-supabase.sh env)"
  unset LOCAL_SUPABASE_DB_URL SUPABASE_DB_URL DATABASE_URL FSRS_TEST_DB_URL
  cd apps/ui
  npm run build
)
```

The subshell and explicit unsets keep database test variables out of the build
and the caller's shell.

After the UI starts, verify the runtime is connected to a database with the
current platform RPC contract:

```bash
curl http://localhost:3100/api/health?deep=1
```

Expected high-level result:

```json
{
  "status": "ok",
  "database": { "target": "local" }
}
```

If the response is `"status": "warning"` and mentions a missing RPC such as
`fetch_dictionary_entry_by_id_gated`, the UI is connected to an old or wrong
Supabase database. Preserve an intentionally retained environment and inspect
its receipts with `check`. Rebuild the disposable canonical QA database with
`all --confirm-reset`.

Manual alternative: copy the exports from `scripts/db-local-supabase.sh env` into
your shell, including the local anon/service keys printed by `supabase status -o env`.

## Reset

To rebuild the local DB from scratch:

```bash
scripts/db-local-supabase.sh reset --confirm-reset
scripts/db-local-supabase.sh probe
```

## Staging

Use the reviewed deployment gate for a populated staging database. Bootstrap is
for a fresh disposable target only. Never pass a remote URL to the local wrapper.
Keep staging project secrets out of committed files.
