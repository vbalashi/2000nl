# DB221 production verification and catalog measurements

2026-10-08. Released commit `7748355389c56becc9d34013e6cba554028ff466`,
version0.18.1202, PR624. Verification and timing use the isolated QA identity,
read-only production transactions, 10-second statement timeouts and rollback.
No Training starts, grading, learner state writes, global settings, cache flush
or backend termination. Browser runs were not used alongside SQL measurements.

## What actually shipped

- Production `pg_proc.prosrc` matches the committed migration221 body after
  whitespace normalization, not merely its expected contract number.
- Migration ledger221 has the exact file SHA256
  `1abfb3d427cdab34b56c3e349fccd85f181334bf822200b21c87ecd1c9d2ad8f`
  and the released app commit; contract state is DB221 at that same commit.
- Actual SECURITY DEFINER, STABLE, pinned search_path and argument names match.
  Authenticated can execute; anon and PUBLIC cannot. Full chained read-only
  postflight221 passes in production. Exact-commit deep health passes again
  after measurements.
- Code audit against pre-release04a4b3dc confirms only curated counting changed.
  Identity guard, null-source branch, user ownership, list type/language behavior,
  source access policy, JSON fields/defaults and ordering survive. UI listService
  uses the same deployed RPC name and named arguments. Bootstrap, manifest,
  postflight and isolated CI migration validation are wired correctly.
- Released-head CI passed:2116 UI,180 API,186 ordinary browser,25 pilot and17
  reliability cases, plus FSRS and DB drift/actual catalog checks. The initial
  Training resume failure did not recur on the same-head full rerun; its cause
  remains unestablished. Tests were not weakened.

## Timing evidence

Three sequential series, three clients per series, two calls per client:
18 SQL executions through the configured transaction pooler. All nine client
connections reused backend3564429: fresh client does not mean fresh backend.

| Observation | Result |
|---|---:|
| All18 calls, median |34.322ms|
| Ordinary calls below100ms |16, range32.181–57.977ms|
| Ordinary subset median |34.175ms|
| Initial call |4311.339ms|
| Immediate repeat of initial call |140.030ms|
| Subsequent highest call |57.977ms|

Earlier production ordinary baseline was46.868/48.056ms; the ordinary subset
is approximately28% lower than their midpoint. This is a descriptive comparison,
not a controlled performance percentage or an entire UI loading improvement.
Two baseline observations are sparse, load/cache/time can differ, and the
current trace has18224 entries. No tail frequency/p95 claim is supported by18
samples. One observed4.31s call proves the tail remains; it does not prove a
regression versus the earlier2.75s maximum.

Two additional session-pooler clients held their connections until both
profiles completed, obtaining distinct backends3564457 and3564459. Timed nested
profiles returned357.540/45.473ms and59.874/49.445ms. Profiling overhead and
connection mode differ from the unprofiled series; keep these timings separate.

Both nested curated plans have shape hash `93af0a5975f7`, one entry Seq Scan
(18224 rows, one loop), and21449 collection membership rows. Repeated nested
shared hits8917 versus earlier26364, about66% less buffer work. Zero shared
reads, zero temporary spills and zero reported IO time. This confirms the
planned one-pass projection is actually executing in production. The first
profiled nested query took291.793ms, including246.481ms in that single entry
scan, versus repeat42.973ms with12.598ms in the scan. Ancestor/node times are
inclusive and must not be summed. No CPU or scheduler attribution is proven.
The4.31s unprofiled call has no matched nested trace, so the shorter profiled
call cannot be substituted as its explanation.

## Characterization gaps found and closed

Independent code review found two missing fixture families, not a demonstrated
production behavior defect: nullable-source reads and entitlement boundaries.
Added seven fixture states: legacy null source, expired user grant, future user
grant, active user grant, restricted tier-only grant, active group grant, and
revoked group membership. Each performs30 exact JSON comparisons and four
independent response/count checks across old/new and curated/user paths.
The full suite now has270 JSON comparisons,4auth denials,33independent response
checks and4scope-work guards. All pass on dedicated PostgreSQL17.6.

Current management triggers reject new null-dictionary entries; the legacy NULL
row is deliberately synthesized only in the disposable fixture with user
triggers briefly disabled for insertion and immediately restored. Management
constraints remain enabled. A fixture assertion verifies the stored NULL.
This does not claim production ingestion currently permits such rows.
A deliberate fault removing the candidate NULL-access branch causes JSON parity
to fail; the correct migrated function passes. Initial naive nl insertion was
backfilled by a trigger, and en insertion was rejected by management enforcement;
those attempts were not counted as NULL coverage. Production was never used
for any fixture mutation. Test databases and owned container were removed.

## Assessment and next step

Good: the change is present in the database and application version, preserves
contracts, and materially reduces normal catalog work. The review gaps are now
covered by additional tests. Bad:4.31s catalog latency remains, so #413 stays
open. The deploy scheduler probe4046ms is a separate RPC path, not catalog data.

Next bounded investigation: obtain a nested trace on an actually multi-second
DB221 catalog call and correlate that exact backend/interval with managed
resource evidence (coordination #440/PR444). Do not infer managed CPU saturation
from zero IO or local-process CPU tests; do not add speculative SQL/cache/compute
changes without this evidence. Current cache was not artificially cooled.

Private scripts and sanitized captures are preserved under the ignored recovery
directory `.worktrees/.reference-sync-backup-2026-10-08/622-release-measurement/`
in `catalog-db221-postrelease/`, with its parent SHA256SUMS index updated. Raw
nested SQL/user values were never saved by the profiling helper; only the
existing allowlisted privacy-parser output was written.
