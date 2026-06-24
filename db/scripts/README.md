# Database Scripts

## Connection

Use `psql_supabase.sh` to connect to the Supabase database:

```bash
./db/scripts/psql_supabase.sh
```

Requires `SUPABASE_DB_URL` or `DATABASE_URL` environment variable.

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

---

## Development

When adding new scripts:
1. Add connection logic using `SUPABASE_DB_URL` or `DATABASE_URL`
2. Document usage in this README
3. Update `/docs/features/app-behavior.md` with the new tool
