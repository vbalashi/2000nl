# DB221 matched slow profile and covering-index experiment

2026-10-08, released commit7748355 / DB221. Follow-up to
[catalog-db221-postrelease.md](./catalog-db221-postrelease.md).
Production probes were sequential QA read-only transactions with10s timeouts,
local profiling settings and rollback. No Training, learner changes, global
settings, backend termination, artificial cache flush, extension installation
or production index/schema writes. Only privacy-parser summaries persisted.

## New matched evidence

Previous DB221 profiles used the session pooler. Two bounded series now use
the production transaction pooler6543. The first series reused backend3565863:
408.361/44.235,43.217/43.568,169.633/53.706ms. The second series stopped after
its first slow pair on backend3565913:3229.945/46.275ms. It is a new observed
PID, not proof of a physically cold shared cache or newly started backend.

| Same backend, same nested plan93af0a5975f7 | Slow | Repeat |
|---|---:|---:|
| Outer RPC execution |3229.945ms|46.275ms|
| Nested curated query |3204.483ms|43.846ms|
| Entry Seq Scan,18224rows,one loop |3052.605ms|13.220ms|
| Shared hits, nested root |9057|8917|
| Shared reads / temp read / temp write |0/0/0|0/0/0|
| Reported shared/local/temp IO time |0|0|

About95% of the slow RPC wall interval is inside the one wide-entry scan.
The repeated scan cost is ordinary. Materialized projections and membership
joins are active as planned; the same21449membership rows appear. Ancestor
node times include descendants; do not sum them or multiply total outer
timings by count of loops. The95.381ms metadata/function-stat plan happened
after the slow RPC and is not included in its3229.945ms.

This confirms the remaining tail is inside executor wall time on DB221,
not merely browser/auth/network or a missed migration. It does not identify
CPU consumption, CPU throttling, OS scheduling, or unreported short waits.
There are no exact server start/end timestamp markers or correlated managed
resource metrics for this sample. Therefore no per-request resource attribution
is claimed. The capture improves localization; it is not a proof that the scan
consumed3seconds of CPU.

## What was already tried

- JIT-off mitigation is already active on the relevant historical path.
- Higher transaction-local work memory removed historical scheduler spills
  without removing first-use delay; catalog profiles have no spills already.
- Fresh client is not a fresh backend; repeated pooler reuse was recorded.
- PrototypeA membership-first regressed and was rejected.
- DB221 prototypeB preserved behavior and reduced entry scans from3to1;
  ordinary work improved while multi-second tails remain.
- Isolated process CPU counters/local Postgres and NUC host counters cannot
  establish managed Supabase CPU attribution. PR444 records this limitation
  and pending identity/interval correlation gates. Its older dashboard snapshot
  is not current evidence for this exact request.

## New experiment: narrow covering index

Dedicated disposable PostgreSQL17.6, unchanged actual migrated catalog RPC
and18184wide synthetic entries. Add only
`CREATE INDEX catalog_fixture_entry_identity_source ON public.word_entries(id) INCLUDE(dictionary_id)`
and run identical unprofiled EXPLAIN calls with JIT off/work_mem2184kB.
Run with index, remove index, recreate index. Separate timed nested profiles
confirm Index Only Scan; profiling times are not compared to unprofiled times.

| Repeated calls in paired stages | RPC ms | Shared hits |
|---|---|---:|
| Index present |10.621/9.875/9.212|648|
| Index removed |11.552/11.991/11.199|5071|
| Index recreated |9.552/8.978/9.803|648|

Initial stage calls17.146/21.909/16.191ms include per-client first-use effects;
index-present first calls read111/112blocks. Index size917504bytes; fixture
heap37150720bytes. Repeated work is about87% fewer shared hits. Median repeats
are9.678ms with index (six values) versus11.552ms without (three values),
roughly16% lower, with sparse local samples. This is not production speedup.
Current exact JSON/ownership/auth/access cases and30additional index-parity
comparisons passed. The index affects physical access, not the RPC contract.

A read-only production feasibility snapshot found no existing index covering
both entry id and dictionary_id. Heap71475200bytes, relpages8725 and
relallvisible8725; these are planner statistics, not a guarantee that every
page will remain all-visible after writes. Installed diagnostic extensions
include pg_stat_statements, not pg_stat_kcache or pg_wait_sampling.
No extension was installed. The test container/databases were removed.

[Index-only scan documentation](https://www.postgresql.org/docs/17/indexes-index-only-scans.html)
explains that covering columns permit reading the index directly but visibility
map state still determines heap checks. Payload columns add index storage and
maintenance. The current scalar UUID projection is narrow; runtime heap-fetch
counts and index size still need production verification after any rollout.

## Assessment and next bounded work

Confirmed good: cleanup/contract tests and DB221 are actually deployed and
ordinary SQL work is reduced. Confirmed unresolved: a3.23s call remains on
the same one-pass plan, so #413 stays open.

The covering index is a new evidence-backed candidate for further reducing
the scan work and exposure to a wide heap. It has not demonstrated elimination
of managed multi-second latency. Before proposing rollout, validate scaling,
visibility after writes, planner choice and exact count/access contracts;
prepare an independent reviewed forward migration and contract if accepted.
Then measure the same actual RPC after release, including slow samples.
Do not add a cache yet: that adds ownership/access invalidation semantics
while leaving the direct SQL issue unexplained.

In parallel, resource attribution would distinguish useful CPU work from
managed scheduling; it requires exact server interval markers and available
managed counters, not just aggregate historical CPU graphs. Cost/compute
changes are not justified by the present snapshot alone.

Scripts/sanitized production profiles and local synthetic fixture logs are in
the ignored recovery directory `622-release-measurement/catalog-db221-slow-profile/`,
with the parent SHA256SUMS updated. Local fixture raw notices contain only
synthetic data; production raw SQL notices were not persisted.
