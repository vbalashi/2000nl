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

## Reuse the existing database first

For routine QA, run the read-only check before starting or replacing the UI:

```bash
scripts/db-local-supabase.sh check
scripts/ui-local-dev.sh --pilot --port 3100
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

If `check` fails, preserve the database and diagnose the reported condition.
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

If local dictionary data exists under `db/data/words_content`, import it and re-run probes:

```bash
python3 -m venv .venv
.venv/bin/pip install -r packages/ingestion/requirements.txt
scripts/db-local-supabase.sh import
scripts/db-local-supabase.sh probe
```

Run the FSRS RPC/parity suite against the local Supabase database:

```bash
scripts/db-local-supabase.sh test-fsrs
```

The wrapper links the common DB URL names for the test process:

- `LOCAL_SUPABASE_DB_URL` optionally overrides the local Docker Supabase DB URL.
- `SUPABASE_DB_URL`, `DATABASE_URL`, and `FSRS_TEST_DB_URL` are exported to the selected local DB URL.
- `apps/ui/tests/fsrs` resolves DB URLs in this order: `FSRS_TEST_DB_URL`, `SUPABASE_DB_URL`, `DATABASE_URL`.
- `db/scripts/psql_supabase.sh` reads `SUPABASE_DB_URL` or `DATABASE_URL` from env, then falls back to repo `.env.local`.

For an intentional rebuild after preserving any needed data, run the whole
local DB harness:

```bash
scripts/db-local-supabase.sh all --confirm-reset
```

`all` resets the local Supabase database, applies bootstrap, runs probes, runs
FSRS tests on the clean DB, imports dictionary data when present, and runs probes
again. The default directory is imported automatically when it exists; an
explicit directory is optional. Wait for command completion before using the
database. Do not insert ad-hoc source rows while import is running: source rows
must have exact coverage by the importer's source bindings.

Unacknowledged `all` and `reset` stop before any service/database command.
Local wrapper commands accept only loopback PostgreSQL URIs without connection
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
scripts/ui-local-dev.sh --pilot --port 3100
```

Then open the dev-login helper on the same origin:

```text
http://localhost:3100/dev/test-login?redirectTo=/
```

The wrapper reads `supabase status -o env`, exports local `NEXT_PUBLIC_SUPABASE_*`
and server-side `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` values for
that UI process only, and leaves `.env.local` unchanged.

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
Supabase database. Preserve existing data, inspect the checkout and migration
receipts with `check`, then plan the necessary forward migrations. Do not reset
a populated environment to silence a missing-RPC or index warning.

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
