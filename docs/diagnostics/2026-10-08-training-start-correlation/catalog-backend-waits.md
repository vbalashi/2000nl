# DB221 catalog: own-backend wait sampling

2026-10-08. Production health:7748355 /0.18.1202 /DB221.
Follow-up to [unprofiled interval and aggregate metrics](./catalog-managed-interval.md)
and [instrumented nested profile](./catalog-db221-slow-profile.md).

## Bounded method

Three series, two unchanged catalog RPC calls per series, isolated QA identity.
The target used transaction pooler6543 and held a READ ONLY transaction,
10s statement timeout,20s idle-in-transaction timeout, authenticated role,
transaction-local identity claims and a unique application name. An independent
same-project session-pooler5432 observer selected only the exact target PID
and unique application name. No query text, account identity, rows from other
backends or raw notices were persisted.

The observer took50snapshots per series, nominally100ms apart, in a separate
READ ONLY transaction with10s timeout. Each iteration explicitly cleared the
statistics snapshot; it recorded server timestamp, target PID, state, wait type,
wait event and query_start. RPC elapsed times use server clock_timestamp around
the function, without nested auto_explain. Auto-explain was disabled locally;
actual target settings were track_activities=on, track_io_timing=off and
track_functions=none. No extensions, global settings, schema changes, Training
starts or learner writes. Both owned clients closed and transactions rolled back.

Observation capability was confirmed before each pair against the pinned target.
Outside RPCs the target reported idle-in-transaction / ClientRead; those samples
are excluded from request analysis. Offline analysis requires exact PID,
state=active and timestamps within the measured RPC interval. No overlapping
active sample means inconclusive, not absence of waits. The five-second observer
window is finite; no observation coverage is claimed outside its saved samples.

## Results

All three target clients reused backend3567768; all three observer clients reused
backend3567766. This is not three independent cold backends. Every result length
was3. New PID observation does not prove a cold shared cache or new backend.

| Series/call | Direct RPC wall ms | Active interval samples | Sampled wait events |
|---|---:|---:|---|
|1/1|3377.970|33|All wait_type/wait_event NULL|
|1/2|34.459|1|NULL|
|2/1|37.250|0|Unsampled, inconclusive|
|2/2|36.478|1|NULL|
|3/1|34.484|0|Unsampled, inconclusive|
|3/2|36.604|1|NULL|

The slow RPC interval was19:15:46.809383–19:15:50.187353UTC. Active observations
span19:15:46.846133–19:15:50.091924UTC, with maximum gap104.628ms.
All33samples show active / no reported wait. They do not establish what happened
between samples or during the initial36.750ms and final95.429ms gaps.

## Assessment and diagnostic limit

Useful progress: the actual slow call is tied to a specific backend and server
interval, without the nested profiler. No persistent PostgreSQL-reported Lock,
LWLock, IO or other wait appeared in the sampled instants. This weakens an
explanation based on one long visible database wait during this invocation;
it does not exclude short waits or classify the whole interval as CPU work.

[PostgreSQL17 monitoring documentation](https://www.postgresql.org/docs/17/monitoring-stats.html)
distinguishes state from wait_event: active with NULL wait_event is not a CPU
consumption counter. The view cannot distinguish useful CPU execution from
OS scheduling/throttling when the process is runnable. The earlier nested profile
localizes another slow invocation to the entry scan; it is not the nested plan
of this specific3.38s call. Aggregate managed metrics over a minute are also
not an exact per-backend resource attribution.

Do not create a production migration or compute upgrade from this evidence.
Further identical100ms polls have diminishing value now that the slow sample
has33active observations with no reported wait. The next useful evidence is
provider/host-side per-backend CPU and scheduling observation during a marked
slow interval, or a controlled representative reproduction with actual process
CPU accounting. Neither historical NUC counters nor local index improvements
supply that missing production evidence. Coordinate this boundary with#440/PR444;
#413 was previously observed closed and its lifecycle is unchanged.

The separate covering-index experiment remains a visibility-dependent ordinary
work optimization, not an established fix for these tails. Warm repeated catalog
calls are still34–37ms here; this diagnostic stage did not change user performance.

## Evidence and integrity

Ignored sampler, offline analysis, three sanitized series and summary:
`tmp/latency-audit/catalog-wait-sampler.py`, `catalog-wait-analysis.py`,
`catalog-waits/series-*.json`, `catalog-waits-summary.json`, `catalog-waits-run.txt`.
They are copied to project-local recovery archive
`622-release-measurement/catalog-backend-waits/`, with SHA256SUMS refreshed.
The added observer itself has cost and may influence scheduling; no claim of
zero monitoring overhead or request-level CPU attribution is made.
