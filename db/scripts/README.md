# Database Scripts

## Connection

Use `psql_supabase.sh` to connect to the Supabase database:

```bash
./db/scripts/psql_supabase.sh
```

Requires `SUPABASE_DB_URL` or `DATABASE_URL` environment variable.

## Commit-owned deployment contract

`deploy_db_contract.mjs` is the fail-closed NUC migration gate. It validates the
checked-out manifest and migration checksums, applies missing managed migrations
transactionally, records them atomically, and runs the exact postflight probe.

```bash
node db/scripts/deploy_db_contract.mjs expected
node db/scripts/deploy_db_contract.mjs rollout-status
DEPLOY_APP_COMMIT="$(git rev-parse HEAD)" \
  node db/scripts/deploy_db_contract.mjs apply --env-file .env.local
```

The repository contract can intentionally hold deployment before any database
access. Follow `docs/runbooks/nuc-db-contract-deploy.md`; never bypass a hold or
run the gate manually against production.

CI also runs `deploy_db_contract.integration.test.mjs` against disposable real
PostgreSQL. It proves transactional DDL/ledger rollback, repaired retry on the
same database, postflight success, and idempotent replay. Set
`DB_CONTRACT_INTEGRATION_DATABASE_URL` only to a non-production PostgreSQL
database whose user may create and drop a uniquely named test database.

---

## SRS History Analysis

**Script:** `srs_history.sh`
**Purpose:** Debug SRS queue issues by analyzing user learning history

### Usage

```bash
# Analyze all reviews for a user
./db/scripts/srs_history.sh --user-id <user_id>

# Analyze specific word for a user
./db/scripts/srs_history.sh --user-id <user_id> --word-id <word_id>

# CSV output
./db/scripts/srs_history.sh --user-id <user_id> --format csv > out.csv
```

### Example

```bash
./db/scripts/srs_history.sh --user-id abc-123-def-456
./db/scripts/srs_history.sh --user-id abc-123-def-456 --word-id 789
```

### Output

The script shows chronological review history including:
- Card appearances with timestamps
- User response grades (1=again, 2=hard, 3=good, 4=easy)
- Interval values before and after each review
- Anomaly flag for repeated cards despite good/easy answers
- Word headword or form text

### Use Cases

- Debug issue 2000NL-002 (words repeating after "goed" answer)
- Analyze FSRS interval progression
- Identify queue anomalies
- Understand user learning patterns

### Database Tables Used

- `user_review_log`: Review history with grades and intervals
- `user_card_status`: Current card state and FSRS fields
- `word_entries.headword`: Word text lookup
- `word_forms.form`: Word form variations

**Note:** The script filters out `review_type='click'` events (sidebar word lookups) to focus on actual reviews.

---

## REST Export (When Postgres Is Unreachable)

**Script:** `srs_history_rest.sh`
**Purpose:** Export the same history via Supabase REST API (HTTPS), useful when direct Postgres connections are blocked.

```bash
./db/scripts/srs_history_rest.sh --user-email you@example.com --format csv > out.csv
./db/scripts/srs_history_rest.sh --user-id <user_id> --format json > out.json
```

---

## Pre-Drop Card State Parity

**Script:** `check_user_card_status_parity_before_drop.sql`
**Purpose:** Before applying `db/migrations/052_drop_legacy_user_word_status.sql` to a production-like database, verify that every legacy `user_word_status(user_id, word_id, mode)` row has an exact `user_card_status(user_id, entry_id, card_type_id)` counterpart.

```bash
SUPABASE_DB_URL="$DATABASE_URL" ./db/scripts/psql_supabase.sh \
  -f db/scripts/check_user_card_status_parity_before_drop.sql
```

Run this after migration `042_physical_user_card_status.sql` and before migration `052_drop_legacy_user_word_status.sql`. It fails on missing keys, mismatched FSRS/state fields, and review-log rows without card state.

---

## Live Dictionary Migration Runner

**Script:** `live_dictionary_migration.sh`
**Purpose:** Run the live dictionary/list/card/user-dictionary migration as two
explicit phases, with the user-card-status parity gate between the
non-destructive and destructive migration batches.

```bash
SUPABASE_DB_URL="$LIVE_SUPABASE_DB_URL" db/scripts/live_dictionary_migration.sh preflight
SUPABASE_DB_URL="$LIVE_SUPABASE_DB_URL" db/scripts/live_dictionary_migration.sh phase1
SUPABASE_DB_URL="$LIVE_SUPABASE_DB_URL" db/scripts/live_dictionary_migration.sh parity
SUPABASE_DB_URL="$LIVE_SUPABASE_DB_URL" LIVE_MIGRATION_ALLOW_DESTRUCTIVE=1 \
  db/scripts/live_dictionary_migration.sh phase2
SUPABASE_DB_URL="$LIVE_SUPABASE_DB_URL" db/scripts/live_dictionary_migration.sh postflight
```

`phase2` applies `052_drop_legacy_user_word_status.sql` and later migrations,
so it refuses to run unless `LIVE_MIGRATION_ALLOW_DESTRUCTIVE=1` is set after a
backup and successful parity gate.

See `docs/runbooks/live-dictionary-migration.md` for the full operational
sequence and stop conditions.

---

## Dictionary Latency Benchmark

**Script:** `dictionary_latency_benchmark.mjs`
**Purpose:** Attribute dictionary lookup/search latency across direct SQL,
2000NL Platform HTTP, and the AudioFilms proxy without printing secrets.

Use it for issue #40 and related outlier diagnostics:

```bash
node db/scripts/dictionary_latency_benchmark.mjs \
  --queries ontdekken,de,het,zijn \
  --samples 30 \
  --hot-queries de,het \
  --hot-samples 100 \
  --output tmp/dictionary-latency.jsonl \
  --summary-output tmp/dictionary-latency-summary.json
```

The script emits JSONL rows with timestamp, layer, query, path, group, sample
kind, status, total time, TTFB, `Server-Timing`, request ID, result shape, and
result count. The summary JSON aggregates rows by layer/path/query/group/sample
kind and reports p50/p95/p99/max for total time, TTFB, and named
`Server-Timing` metrics.

Requirements:

- SQL layer: `SUPABASE_DB_URL` or `DATABASE_URL`
- 2000NL HTTP layer: `PLATFORM_CATALOG_ACCESS_TOKEN`
- AudioFilms layer: no local token is required for the production proxy

Use `--layers sql` or `--layers http-2000nl,audiofilms` to isolate one side of
the boundary. Use `--no-lookup`, `--no-full-search`, or `--no-group-search` for
focused runs.

### Authenticated exact-group latency

`platform_exact_group_latency_benchmark.mjs` repeatedly calls the authenticated
Platform V2 training lookup for one exact Dictionary Entry and Headword Group.
It discovers the identity once through catalog lookup, mints an isolated test
session, records request IDs and `Server-Timing`, and revokes that session in a
`finally` block. It does not call learning mutation endpoints.

```bash
node db/scripts/platform_exact_group_latency_benchmark.mjs \
  --batches 10 \
  --samples-per-batch 5 \
  --idle-ms 6000 \
  --warm-spacing-ms 150 \
  --output tmp/issue-207-route-rows.jsonl \
  --summary-output tmp/issue-207-route-summary.json
```

Required environment: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
`PLATFORM_CATALOG_ACCESS_TOKEN`. `--email` defaults to the isolated
`test@2000nl.test` account. Output never contains access, refresh, service-role,
or catalog tokens.

The benchmark enforces a maximum of 55 total requests (five fixed auth,
health, catalog, and cleanup requests plus 50 lookup reads), a 15-second timeout on
each HTTP read, at least 6 seconds before every intended cold sample (the
deployed auth cache TTL is 5 seconds), and at least 150 ms between warm
samples. Every first sample must expose a cold-auth `Server-Timing` signal or
the run fails. Faster pacing is accepted only with `--allow-fast-local` and a
loopback `--base-url` (`localhost`, `127.0.0.1`, or `[::1]`). The same bounded
fetch is installed on both Supabase auth clients, so session creation,
verification, and revocation cannot hang indefinitely. A timed-out revocation
is reported as cleanup failure and is never recorded as successful. Argument,
timeout, and cleanup policy checks run with:

```bash
node --test db/scripts/platform_exact_group_latency_benchmark.test.mjs
```

### Next-card selection latency

`next_card_selection_latency_benchmark.mjs` compares the retired JSON predicate,
the indexed anti-join, and the complete scheduler on a disposable local database.
It refuses non-loopback targets and database names without `issue228`. The fixture
must contain at least 18,000 entries and the isolated `test@2000nl.test` benchmark
principal (`22800000-0000-0000-0000-000000000001`).

```bash
ISSUE_228_BENCHMARK_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/issue228_benchmark \
  node db/scripts/next_card_selection_latency_benchmark.mjs
```

The rollout budget is: plan-cold first scheduler call at most 2,000 ms, warm p95
at most 1,000 ms, and warm maximum at most 2,000 ms across 30 samples. The first
sample discards prepared plans but cannot flush local shared buffers or the OS
cache, so cold/warm production reads remain a rollout gate.

### Scheduler dictionary-access scope

`scheduler_dictionary_access_benchmark.mjs` exercises the session-plan and
next-card RPCs against exactly 18,184 non-null dictionary-bound entries. The
fixture covers system, owned, public, entitled, and denied dictionaries and
requires the isolated `test@2000nl.test` identity. Function statistics prove
that access checks scale with the registered dictionary set, not the entry set.
It refuses non-loopback targets and database names without `issue232`.

```bash
ISSUE_232_BENCHMARK_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/issue232_benchmark \
  node db/scripts/scheduler_dictionary_access_benchmark.mjs
```

Safety guards run without a database:

```bash
node --test db/scripts/scheduler_dictionary_access_benchmark.test.mjs
```

The enforced budget is first at most 2,000 ms, warm p95 at most 1,000 ms, and
warm maximum at most 2,000 ms for both RPCs over 30 warm samples. See
`docs/architecture/evidence/issue-232/` for the baseline, set-based result, and
the indivisible 123→126 production rollout/rollback gate.

---

## Development

When adding new scripts:
1. Add connection logic using `SUPABASE_DB_URL` or `DATABASE_URL`
2. Document usage in this README
3. Update `/docs/features/app-behavior.md` with the new tool
