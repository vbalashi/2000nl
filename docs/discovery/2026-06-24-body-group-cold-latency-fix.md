# Body-Group Cold Latency Fix

Date: 2026-06-24  
Issue: [#40](https://github.com/vbalashi/2000nl/issues/40)

## What Changed

- Added `097_bounded_body_group_branch_pages.sql`.
  - Examples/Definitions now bound FTS and substring branches separately before hydration.
  - Substring fallback is skipped when the FTS branch already has `limit + 1` rows for the current page.
- Added `098_body_group_page_order_indexes.sql`.
  - Adds page-order partial indexes for Examples/Idioms and Definitions/Context/Notes.
  - These let common body-group queries scan in cursor order and stop at `LIMIT + 1`.
- Added a DB/RPC regression test for pagination from FTS results into substring fallback.

## Key Finding

The first branch-bounding change was necessary but insufficient.

For common terms such as `de`, PostgreSQL still used the FTS GIN index, collected
all body-field matches, sorted them by cursor order, and only then applied
`LIMIT + 1`.

Observed internal plan before page-order indexes:

```text
Bitmap Index Scan dictionary_search_fields_examples_tsv_v2_idx rows=7969
Bitmap Heap Scan dictionary_search_fields rows=7969
Sort rows=7
Execution: ~16.4 ms warm, with much larger cold spikes in benchmark samples
```

Observed internal plan after page-order indexes:

```text
Index Scan dictionary_search_fields_examples_page_order_v2_idx rows=7
Execution: ~0.8 ms warm
```

For Definitions after `ANALYZE dictionary_search_fields`:

```text
Index Scan dictionary_search_fields_definitions_page_order_v2_idx rows=9
Execution: ~5.7 ms warm
```

## Validation

Commands run:

```bash
git diff --check
db/scripts/psql_supabase.sh -c "begin" -f db/migrations/097_bounded_body_group_branch_pages.sql -c "rollback"
db/scripts/psql_supabase.sh -c "begin" -f db/migrations/098_body_group_page_order_indexes.sql -c "rollback"
NODE_TLS_REJECT_UNAUTHORIZED=0 npm --prefix apps/ui test -- tests/fsrs/fsrsRpc.test.ts
node db/scripts/dictionary_latency_benchmark.mjs --insecure-tls --queries de,het --groups examples,definitions --layers sql,http-2000nl --samples 8 --hot-queries de,het --hot-samples 20 --idle-ms 1000 --summary-output docs/discovery/2026-06-24-body-order-index-post-analyze-benchmark-summary.json
```

DB/RPC tests:

```text
46 passed
```

## Post-Analyze Benchmark Summary

After applying the function change, creating indexes, and running
`ANALYZE dictionary_search_fields` on live:

| Layer | Query | Path | Sample | p50 | p95 | max | DB p95 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| SQL | de | examples | warm | 60.6 ms | 61.9 ms | 61.9 ms | n/a |
| SQL | de | definitions | warm | 59.6 ms | 61.6 ms | 61.8 ms | n/a |
| SQL | het | examples | warm | 54.1 ms | 56.3 ms | 56.7 ms | n/a |
| SQL | het | definitions | warm | 53.1 ms | 55.1 ms | 55.3 ms | n/a |
| HTTP | de | examples | warm | 109.7 ms | 124.6 ms | 133.3 ms | 64.4 ms |
| HTTP | de | definitions | warm | 109.2 ms | 126.9 ms | 140.0 ms | 62.2 ms |
| HTTP | het | examples | warm | 113.9 ms | 129.4 ms | 140.4 ms | 70.9 ms |
| HTTP | het | definitions | warm | 113.4 ms | 120.8 ms | 122.8 ms | 63.4 ms |

First-after-idle body-group samples were also bounded after `ANALYZE`:

| Layer | Query | Path | first-after-idle total | DB timing |
| --- | --- | --- | ---: | ---: |
| SQL | de | examples | 65.6 ms | n/a |
| SQL | de | definitions | 89.7 ms | n/a |
| SQL | het | examples | 55.3 ms | n/a |
| SQL | het | definitions | 56.7 ms | n/a |
| HTTP | de | examples | 128.1 ms | 68.5 ms |
| HTTP | de | definitions | 122.2 ms | 54.6 ms |
| HTTP | het | examples | 136.1 ms | 74.7 ms |
| HTTP | het | definitions | 121.5 ms | 57.4 ms |

One remaining HTTP full-search first-after-idle outlier was observed:

```text
http-2000nl het/full first-after-idle: 908.5 ms total, search.db 715.1 ms
sql het/full first-after-idle in same run: 105.0 ms
```

Warm full-search samples were stable:

```text
http-2000nl de/full warm p95: 132.0 ms, search.db p95 67.0 ms
http-2000nl het/full warm p95: 137.1 ms, search.db p95 72.4 ms
```

## Working Conclusions

- Grouped search and Alphabetical should remain enabled.
- The confirmed SQL issue was not only full materialization across FTS and substring branches.
  It was also missing page-order access paths for common body-group terms.
- The body-group cold SQL path is now bounded for the measured common terms after
  the new indexes and statistics refresh.
- HTTP/PostgREST/pooler first-after-idle outliers still exist and remain in #40.
  They are no longer explained by warm body-group SQL shape alone.

## Operational Note

After creating these indexes on live, run:

```sql
ANALYZE dictionary_search_fields;
```

Without refreshed statistics, early post-index measurements can still show noisy
plans and first-after-idle spikes.
