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

The project wrappers disable Supabase CLI telemetry for local commands. The CLI
otherwise writes `~/.supabase/telemetry.json` before dispatching even `start` or
`status`, which is incompatible with agent sandboxes that intentionally allow
the repository and temporary directories but not arbitrary home-directory
writes. Do not grant full filesystem access merely to permit that telemetry
side effect; use the wrappers below.

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
manifest, and runs existing platform and the checksum-pinned read-only postflight with read-only sessions.
Behavioral import postflights (177–178) create temporary test content and roll it
back; they remain in the managed deployment gate and are not called by `check`.
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

Migration 178 uses staging: a clean empty-dictionary import of the 18,163-artifact
Van Dale corpus took 20.39 seconds on 2026-09-30; identical replay took 8.78
seconds; a one-definition update took 16.73 seconds. These observations exclude
bootstrap, forms and search indexing. Host load and larger content changes can
extend the time. The 155.74-second figure from 2026-09-29 describes an earlier
implementation. Full-corpus performance is tracked in #397; it is not required
for the small #393 browser acceptance fixture.

The full import is needed only to populate an empty database or apply a changed
source manifest. It is not part of `start`, `apply`, `probe`, `test-ingestion`,
browser QA, or normal UI startup. See [dictionary-import.md](dictionary-import.md)
for what each stage does and for cheaper alternatives, or the
[Russian explanation](dictionary-import.ru.md).

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

Fresh Supabase keeps `pgcrypto` in `extensions`. Migration 179 supplies the
public `digest(text,text)` / `digest(bytea,text)` compatibility surface already
used in plain-Postgres tests; do not move the extension or patch individual
RPC search paths by hand. The readiness probe hashes a known value, and
`LOCAL_SUPABASE_DB_URL=... node --test db/scripts/pgcrypto-namespace.test.mjs`
checks both extension layouts in disposable databases. A passing index check
alone does not prove Library lookup; verify a real imported word after reset.

Account saved-training SQL validation uses a disposable database:
`LOCAL_SUPABASE_DB_URL=... node --test db/scripts/account_training_setups.integration.test.mjs`.
It applies own-row RLS and races two expected-revision saves, keeping one winner.
On 2026-09-30 the local Supabase PostgreSQL backend segfaulted while rejecting a
direct anon call to the new revoked RPC (server log: `SET ROLE anon; SELECT
public.save_account_training_setups_v1(...)`, signal 11); the server recovered.
The check now verifies revoked execute privileges and API auth denial without
repeating that native-engine failure. This is an environment limitation, not a
passing direct-denial invocation test. Clean only the exact scoped test database
if a failed run leaves one behind; do not reset the canonical imported DB.


### Retaining updates must not replay bootstrap

`db-local-supabase.sh apply` uses the managed, checksum-pinned forward migration gate. Use `reset --confirm-reset` / `all --confirm-reset` only for a deliberate fresh DB; those paths retain bootstrap. An unmanaged/pre-baseline database fails closed rather than being silently bootstrapped.

On 2026-09-30, the previous `apply` replayed bootstrap on the imported local corpus and failed in migration 120: its content-node source-order update collided with `platform_v2_content_nodes_active_source_order_idx`. Earlier statements had already reinstated old function definitions and retired overloads. Local recovery compared the populated DB with a disposable clean bootstrap at the same checkout, restored 15 non-extension function definitions, and removed the two legacy `*_without_known` signatures without cascading. The two digest adapters retain the intentional Supabase extension namespace. Word-entry, learner-state and review counts were unchanged. This is a harness replay failure, not stale dictionary data or a reason to reset user data. Managed probes and browser checks must pass after recovery.

Account material settings (migration 183) have a disposable integration check:
`LOCAL_SUPABASE_DB_URL=... node --test db/scripts/account_material_preferences.integration.test.mjs`.
It creates/removes a separate local database and checks account isolation,
concurrent revision conflicts, document constraints, unrelated settings and an
existing session row. It does not reset or import into the canonical QA database.

The material launch/resume policy (migration 184) has its own disposable check:
`LOCAL_SUPABASE_DB_URL=... node --test db/scripts/training_material_selection_snapshot.integration.test.mjs`.
It bootstraps and reapplies DDL in a separate database, tests all current start
families and cached v1 receipts, frozen membership/replacement after pause,
forged client snapshots, mixed-language collection filtering, disabled dictionary
selection and independent dictionary access revocation. Fixtures create no
learning action events and roll back; the database is removed afterward.
