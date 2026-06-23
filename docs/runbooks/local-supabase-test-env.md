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

## Fast Path

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

Or run the whole local DB harness:

```bash
scripts/db-local-supabase.sh all
```

`all` resets the local Supabase database, applies bootstrap, runs probes, runs FSRS tests on the clean DB, imports dictionary data when present, and runs probes again.

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
Supabase database. Run `scripts/db-local-supabase.sh all` for local development,
or apply the current migrations to the target project before using platform
routes like lookup, actions, translation, or dictionary details.

Manual alternative: copy the exports from `scripts/db-local-supabase.sh env` into
your shell, including the local anon/service keys printed by `supabase status -o env`.

## Reset

To rebuild the local DB from scratch:

```bash
scripts/db-local-supabase.sh reset
scripts/db-local-supabase.sh probe
```

## Staging

After local `apply/import/probe` passes, repeat the same bootstrap/import/probe sequence against a separate Supabase staging project using that project's database URL. Keep staging project secrets out of committed files.
