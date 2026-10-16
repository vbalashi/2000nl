# Issue #711 local scheduler benchmark (manual, disposable)

`issue-711-scheduler-bench.test.ts` is a manual local reproduction for the actual `private.training_scheduler_candidates_v2` function. It is stored outside the normal `tests` tree so it is not part of routine test runs. It uses `getDbUrl()`, which accepts only a loopback `fsrs_test` or `2000nl_fsrs_*` database, and `withTransaction()`, so all fixture writes roll back. Do not point it at production or the shared `postgres` database.

From the repository root, create a unique disposable database and ensure the cleanup trap runs:

```sh
set -euo pipefail
bench_db="2000nl_fsrs_711bench_$(date +%s)_$$"
bench_url="postgresql://postgres:postgres@127.0.0.1:54322/${bench_db}"
trap 'dropdb --force --if-exists --maintenance-db=postgresql://postgres:postgres@127.0.0.1:54322/postgres "$bench_db" >/dev/null 2>&1 || true' EXIT
createdb --maintenance-db=postgresql://postgres:postgres@127.0.0.1:54322/postgres "$bench_db"
cd apps/ui
FSRS_TEST_DB_URL="$bench_url" npx vitest run --config vitest.issue-711-manual.config.ts --pool=threads --maxWorkers=1 --minWorkers=1 --hookTimeout=120000 --testTimeout=120000
```

The dedicated Vitest config discovers only this manual benchmark; the repository's normal config intentionally excludes it. Migration 227 sets `enable_nestloop=off` on the function, so the harness resets that function-level setting inside its rollback transaction, verifies it is absent, then asserts each `SET LOCAL` planner mode before calling the actual scheduler. It compares selected identity hashes, queue categories, and counts. It checks the source-bound corpus shape (4,500 first meanings, 13,500 later meanings, 18,000 examples, zero unrenderable rows) and includes a 100-item curated-list control and a Review control. It is exploratory evidence, not a release gate or production measurement.

Sanitized timings and interpretation are recorded in `docs/research/issue-711-training-start-timeout-2026-10-16.md` and on issue #711. This manual benchmark is diagnostic evidence, not a release gate or a production measurement.
