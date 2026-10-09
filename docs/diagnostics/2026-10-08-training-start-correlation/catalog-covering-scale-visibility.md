# DB221 covering-index scale and visibility experiment

## Result

On the actual DB221 function body, the covering index is useful when the heap is all-visible: PostgreSQL chose an `Index Only Scan` with zero heap fetches. After updating 10% or 100% of entries and before explicit `VACUUM`, PostgreSQL instead chose a sequential scan. In those dirty visibility states the index did not provide a repeatable latency benefit. This experiment supports VACUUM visibility as a prerequisite for the observed index-only plan; it does not establish a production index recommendation or explain the production outlier.

## Setup and integrity

The experiment ran against an isolated `postgres:17` container mapped to loopback port 65183, then removed the container and disposable database. It did not connect to port 54322 or production. The fixture applied the repository bootstrap and actual migration221, ran the read-only postflight, retained the pinned 203 function as the parity baseline, and copied the post-migration function into `catalog_prototype_candidate` for separate measurement.

Before timing, the harness compared the candidate's `pg_proc.prosrc` byte-for-byte with the function body captured immediately after applying migration221. The comparison passed (SHA-256 `c6e786d8853b91c20560d4815251c7c171a6275ed7fe9cdb0e607577a38a72e4`); the curated projection anchors occur once. The final 100k fixture also passed all 30 exact-JSON parity cases against the pinned 203 baseline.

The wide fixture used JSON rows averaging about 1.76 KB. It contained 18,134 wide entries at the first scale, then 99,950 wide entries (100,001 total `word_entries`) with 100,000 entries in the measured curated list. Updates changed only non-indexed `meaning_id`: 1,813 / 18,134 and 9,995 / 99,950 entries were updated in the distributed 10% phases, followed by an update to every wide entry. `ANALYZE` followed each update. Each scale/state was measured with the existing covering index, without it, and with the index recreated; each measurement made five identical RPC calls in one connection. The timing column is the median of all five calls, including the first. Nested plans were captured separately with `auto_explain`; they are not timing samples.

## Timings and plans

| Scale and heap state | Covering index: median of 5 | No covering index: median of 5 | Plan evidence |
|---|---:|---:|---|
| 18k, initial after VACUUM | 9.6 ms | 12.5 ms | Index Only Scan, 0 heap fetches; no-index Seq Scan |
| 18k, after 10% update, before VACUUM | 10.7 ms | 10.8 ms | Seq Scan with either index state; 2,969 / 4,988 pages all-visible |
| 18k, after 10% update, after VACUUM | 9.0 ms | 11.1 ms | Index Only Scan, 0 heap fetches; no-index Seq Scan |
| 18k, after all-row update, before VACUUM | 10.9 ms | 11.6 ms | Seq Scan with either index state; 1 / 9,068 pages all-visible |
| 18k, after all-row update, after VACUUM | 8.8 ms | 34.0 ms | Index Only Scan, 0 heap fetches; no-index Seq Scan over the bloated heap |
| 100k, initial after VACUUM | 54.3 ms | 82.0 ms | Index Only Scan, 0 heap fetches; no-index Seq Scan |
| 100k, after 10% update, before VACUUM | 102.3 ms | 84.4 ms | Seq Scan with either index state; 16,412 / 27,488 pages all-visible |
| 100k, after 10% update, after VACUUM | 54.2 ms | 86.5 ms | Index Only Scan, 0 heap fetches; no-index Seq Scan |
| 100k, after all-row update, before VACUUM | 110.0 ms | 110.3 ms | Seq Scan with either index state; 1 / 49,976 pages all-visible |
| 100k, after all-row update, after VACUUM | 51.0 ms | 110.5 ms | Index Only Scan, 0 heap fetches; no-index Seq Scan |

The 100k initial index-only scan reported 870 shared-hit blocks versus 12,339 hits plus 12,650 reads for the no-index sequential scan. After the 10% update and before VACUUM, both plans were sequential scans; after VACUUM the indexed plan returned to an index-only scan with zero heap fetches. At 100% updates, only 1 of 49,976 heap pages remained marked all-visible before VACUUM; after VACUUM, all 49,976 were reported all-visible.

The result is not “the index wins in every state.” At 100k, the 10%-updated pre-VACUUM indexed run was slower than the no-index run, while the recreated-index run was close to the no-index run; all used a sequential scan. This is consistent with the plan evidence that the index is not useful in that visibility state. The first/repeated/recreated index order is fixed, runs share the server cache, and local timings varied, so small differences—especially at 18k—are not causal performance estimates. Treat the 100k warm post-VACUUM differences as evidence from this fixture, not a production latency forecast.

## Storage and limitations

At 18k the covering index was 917,504 bytes. At 100k it was 4,980,736 bytes after recreation. The 100k index reached 9,936,896 bytes in the all-row-update pre-VACUUM phase before the harness dropped and recreated it. This demonstrates dead-version/index churn in this update-heavy fixture; it is not a measurement of production index-maintenance cost. The heap grew from 204,709,888 bytes at the initial 100k state to 409,403,392 bytes after the update phases, because the wide rows generated dead tuple versions. The benchmark updates are intentionally severe and should not be treated as a representative write rate.

Autovacuum was left at the disposable server's default and was not independently monitored or disabled. `relallvisible` was sampled after each `ANALYZE`; those pre-manual-VACUUM values remained low in the saved update-state comparisons, but asynchronous autovacuum cannot be ruled out as a timing/storage influence. `relallvisible` is catalog statistics, while `Heap Fetches` comes from the separately instrumented nested plan. For dirty states PostgreSQL selected `Seq Scan`, so there is no index-only heap-fetch count to report there.

The measured benefit concerns this narrow catalog projection; other queries were not assessed. It adds storage and makes index-only execution contingent on visibility-map coverage; no write-latency, production CPU, production I/O, or end-user request benefit was measured. The production experiment remains read-only and separate. No schema or runtime change is recommended from this local experiment alone.

## Artifacts

- Harness: `tmp/latency-audit/catalog-covering-scale-visibility.py`
- Final DB221 run output: `tmp/latency-audit/catalog-covering-scale-visibility-db221-run.jsonl`
- Per-state timing, metadata, and parsed nested-plan summaries: `tmp/latency-audit/catalog-covering-scale-visibility-db221/*.json`
- Raw nested plan logs: `tmp/latency-audit/catalog-covering-scale-visibility-db221/*.nested-plan.log`
- Supabase-image/setup and baseline-target exploratory attempts are preserved separately under `tmp/latency-audit/catalog-covering-scale-visibility-archive/`; they are excluded from the conclusions above.

Ignored artifacts were copied to `622-release-measurement/catalog-covering-scale-visibility/` in the project-local recovery archive, with SHA256SUMS refreshed.
