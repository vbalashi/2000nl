# DB221 CPU-accounting boundary and empty-scope control

2026-10-08. Follow-up to [own-backend wait sampling](./catalog-backend-waits.md).
Production stayed7748355 /0.18.1202 /DB221. This stage checks accessible CPU
accounting, then tests a new contrast without repeating the previous wait poll.

## Accessible accounting

One bounded READ ONLY metadata transaction found PostgreSQL17.6 and
pg_stat_statements installed. pg_stat_kcache, pg_wait_sampling and pg_proctab
were neither installed nor listed in pg_available_extensions; matching CPU
routine prefixes also had no entries. No extension was installed or setting
changed globally. This describes exposed capabilities in this project,
not every provider-side internal tool.

One hosted Metrics API scrape returnedHTTP200. CPU series label names were
supabase_project_ref, supabase_identifier, service_type, cpu and mode; none
identified a PostgreSQL backend PID. Both node_cpu_seconds_total and
process_cpu_seconds_total are counters, but the latter's generic HELP text
and labels do not identify the measured catalog backend. It is not accepted
as per-backend CPU evidence. Raw values/labels and credentials were not retained.

[Prometheus process collector](https://github.com/prometheus/client_golang/blob/main/prometheus/collectors/process_collector.go)
uses its own process by default, with a configurable PID source. Without the
actual service/collector mapping, a generic process CPU metric cannot be
assigned to our PostgreSQL PID. Existing SQL/metrics access therefore does
not provide the requested exact resource attribution; NUC counters remain
irrelevant to managed database process CPU (#440/PR444).

## New bounded contrast

Three target transactions through pooler6543, each held READ ONLY with the
isolated QA identity and authenticated role. Each invoked the unchanged
curated catalog in fixed language order zz,nl,nl. Auto-explain disabled locally;
no concurrent observer. A10s statement timeout applies to the entire three-call
DO statement, not independently to each call. All three series completed;
all clients closed and transactions rolled back. Query-stat counters may
naturally accrue; they were not reset. No learner writes/Training starts.

| Series | Empty scope zz ms | First nl ms | Repeated nl ms |
|---|---:|---:|---:|
|1|23.877|3568.924|73.789|
|2|4.640|32.899|35.435|
|3|1.484|32.686|32.212|

All nine calls reused backend3569026. Empty responses had length0 and nl
responses length3. These are three client transactions on one backend,
not three independent cold samples or proof of a newly started backend.
The slow nl interval was19:36:28.647975–19:36:32.216899UTC, after the first
empty invocation completed at19:36:28.645698UTC.

A separate single instrumented empty-scope verification on backend3569045
used the existing privacy parser, transaction-local DEBUG5 notices below the
server log threshold, and per-node TIMING OFF. It did not save raw notices.
The nested catalog plan had the established shape hash93af0a5975f7,15shared
hits, no reads/temp work, and duration0.063ms. Its entry projection Seq Scan
and entry_sources CTE Scan both had actualLoops0 /actualRows0. Thus this
empty branch genuinely avoided executing the wide projection in that separate
verification. Outer instrumented result duration29.686ms is not compared to
the uninstrumented timings and is not CPU time.

## Interpretation and decision

The simple explanation “only the first function invocation is slow” is
insufficient for the observed sequence: the first invocation finished in24ms,
then a real-scope call took3.57s on the same backend. Calling the empty branch
first did not eliminate that tail. No production warm-up workaround follows.

This does not distinguish first-use planning of a demand-driven branch from
wide-entry execution, OS scheduling, shared-cache/mapping effects or short
waits. The first empty call can warm catalog/SPI/session state. Fixed call
order, one backend and one slow sample are limitations. The empty verification
is a different instrumented invocation and does not provide the nested plan
or CPU accounting of the measured3.57s call. Prior slow-scan and wait samples
are complementary evidence, not one merged causal trace.

Stop identical low-information sampling at this checkpoint. A support-side
profiling handoff should request per-PID user/system CPU and runnable/scheduling
intervals aligned to an observed slow call, plus confirmation of the exposed
metric collector scope. Do not install extensions, change compute or deploy
an index as a presumed tail fix. The separately tested covering index only
establishes a visibility-dependent ordinary-work benefit.

## Evidence

Ignored scripts/sanitized evidence: catalog-cpu-capability.py/json,
catalog-cpu-metrics-scope.json, catalog-scope-control.py/json/run.txt,
catalog-empty-plan.py/json/run.txt under tmp/latency-audit.
Copied to project-local recovery archive
`622-release-measurement/catalog-cpu-boundary/`, with SHA256SUMS refreshed.
No support message was sent; provider-side measurement is a remaining action,
not a tool capability demonstrated here.
