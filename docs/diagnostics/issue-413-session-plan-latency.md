# Issue 413: session-plan latency investigation

Date: 2026-09-22. Base commit: `93a9530f5839d7ce63dc8262ec1b889b091772fa`.
Status: diagnosis and regression coverage; **the production timeout is not fixed**.

## Confirmed current failure

- Historical deployment [35531469093](https://github.com/vbalashi/2000nl/actions/runs/35531469093)
  at `eeb0e2b50298eda76611ec89c6068d249c0e5a78`, contract 155, timed out
  in the six-argument `get_training_session_plan`, inside
  `private.training_scheduler_candidates_v2`.
- Latest deployment [35777536937, attempt 1](https://github.com/vbalashi/2000nl/actions/runs/35777536937/attempts/1)
  applied contract 156 and failed at the same 2,000 ms read. Attempt 2 passed
  unchanged. Therefore the successful latest deployment is not evidence of a fix.
- Contract 156 retains the same six-argument probe, delegated through earlier
  probe files. The new finite-session overload does not replace that read.
- The existing JIT-off mitigation from #361/#371 is already active. Reapplying
  it would not solve this occurrence.

## Bounded read-only measurements

Used the existing diagnostic directly, with the dedicated QA identity, three
samples per component, JIT off, and a 3,000 ms *diagnostic* timeout. The release
probe remains at 2,000 ms. No production data, configuration, deployment, or
shared checkout was changed. Results contain no learner content.

```sh
node db/scripts/scheduler_readiness_diagnostic.mjs \
  --env-file /path/to/private.env --samples 3 --statement-timeout-ms 3000
```

| Sample batch | First public plan | Following public calls | Shared reads | Temp read/write blocks |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2,317.099 ms | 177.629 / 176.460 ms | 0 | 280 / 564 |
| 2 | 1,934.567 ms | 253.395 / 193.667 ms | 0 | 280 / 564 |

Candidate/aggregate/next-card calls were mostly 149–243 ms; one filtered-call
outlier was 1,126.949 ms. First-batch public buffer hits were 8,450, followed
by about 5,341. Another first-call outlier had 5,421 hits. These counters do not
show the missing time being proportional to extra heap reads.

The endpoint uses a transaction pooler (port 6543). Two fresh client connections
returned the same backend PID and backend start time. **A fresh psql process
must not be described as a cold PostgreSQL backend.** The diagnostic now records
backend identity, server version, work memory, JIT, and separate outer planning
metrics so subsequent evidence can distinguish backend reuse. Top-level EXPLAIN
planning time does not reveal all nested PL/pgSQL/SQL-function compilation.

Production shape, observed only through aggregate counters: 18,224 entries,
4,031 NT2 entries, 18,203 source bindings / 14,489 groups, 16,985 active
root/type definition nodes, 14,782 example nodes, and roughly 9,000 other
active content nodes. The QA identity has 26 status rows and one review;
all users combined have 2,985 status rows and 3,380 reviews. PostgreSQL 17.6;
work memory 2,184 kB. A bounded activity snapshot observed one active connection
and no active waits; that snapshot is not proof of contention-free execution
at the earlier outlier.

A same-transaction two-call experiment measured 622.817 / 199.489 ms. A separate
transaction-local 16 MB work-memory experiment removed all temporary spilling,
but still measured 1,027.006 / 186.965 ms. This rules out spilling as a sufficient
explanation; it does not prove memory is irrelevant or justify a global change.

## Production deployment-probe recheck (2026-09-23)

Replayed the current contract-156 read-only pre-switch SQL through the production
transaction pooler: `DISCARD PLANS`, `BEGIN READ ONLY`, the existing 2,000 ms
statement timeout, JIT off, and the committed `pre-switch-read-probe-156.sql`
include chain. All six bounded client runs completed without a statement timeout.
The detailed second batch used the same physical backend PID/start time across
its three runs; its session-plan DO block took 213.011, 219.507, and 218.535 ms.
The adjacent next-card block took 213.782, 219.763, and 219.495 ms; the cached
client scheduler block took 365.844, 374.972, and 367.351 ms. This confirms that
the exact gate is currently fast on the backend and conditions sampled. It does
not reproduce a new backend under a controlled cold-start condition.

The current UI sends the eight-argument `get_training_session_plan` overload
(including `p_session_size='10'` and `p_new_review_ratio=2`). A separate direct
`PERFORM` through the same production pooler, bounded at 3,000 ms and run with
the dedicated QA identity, measured 1,948.890 ms on the first call and 216.995 /
215.490 ms on the next two calls. The three transactions reported the same
backend PID and start time. The first measured call was therefore a real
current-path near-two-second observation on a backend whose recorded start time
was 2026-09-23 09:35:23 UTC, followed by fast calls on that backend. The test
discarded the returned plan and exposed no learner content. The diagnostic used
a 3,000 ms bound to observe latency rather than
abort at 2,000 ms; the first sample was still just under the deploy threshold.
Because the transaction pooler may route a standalone `DISCARD PLANS` statement
to a different backend than the following transaction, this does not prove that
the plan cache was explicitly invalidated on the measured backend.

A read-only `pg_stat_statements` snapshot had last reset at
2026-05-16 15:55:11 UTC. It showed the pre-switch session-plan DO block at a
maximum of 1,916.2 ms over 68 calls, while normalized PostgREST session-plan
calls had historical maxima of 6,477.7 ms (45 calls, six-argument signature)
and 7,350.9 ms (69 calls, seven-argument signature). The current UI calls the
eight-argument overload; these six/seven-argument API entries are legacy
signatures and may reflect older app versions or other callers. The counters
span several months and database contracts, and do not identify the call
timestamp, caller, or parameter values. They are context, not proof that the
current UI path or deploy probe exceeded its bound. The separate diagnostic
EXPLAIN wrapper's 2,115.683 ms first sample is also not the exact deploy probe.

No learner/business data or database configuration was changed. Do not reset
production statistics or tune server settings to investigate further.

## Production readiness diagnostic rerun (2026-09-23)

The existing GitHub Actions workflow was run against the current `main` commit
`583af8e79` with three samples per component. It used the self-hosted production
runner and the dedicated QA identity, with the same bounded read-only transaction,
JIT off, and no writes. All samples used PostgreSQL 17.6 and reported the same
physical backend (`backendPid=2205899`, started at `2026-09-23 11:29:50 UTC`),
so this is a warm-backend comparison rather than a cold-backend experiment.

| Component | First sample | Following samples | Planning | Shared reads | Temp read/write |
| --- | ---: | ---: | ---: | ---: | ---: |
| public six-argument plan | 2,648.276 ms | 181.321 / 179.166 ms | 0.110–0.114 ms | 0 | 280 / 564 |
| next card | 186.833 ms | 196.435 / 182.321 ms | 0.114–0.126 ms | 0 | 280 / 564 |
| filtered card | 148.098 ms | 139.960 / 153.946 ms | 0.116–0.126 ms | 0 | 280 / 564 |
| aggregate / candidate | 176.840 / 176.361 ms | 176.909 / 176.637 and 177.440 / 177.314 ms | 0.127–0.156 ms | 0 | 280 / 564 |

This rerun reproduces the important shape: one slow first public-plan call,
followed by stable sub-200 ms calls on the same backend. The outer PostgreSQL
planner is not spending the missing seconds; the persistent query path is fast
once the backend has completed its first execution. Temporary blocks remain
present in every call, so they are a characteristic of this path rather than a
new first-call-only event. The run therefore strengthens the cold-backend,
pooler, or runtime-initialization hypothesis but does not distinguish which of
those layers owns the delay.

Workflow run: [35854847126](https://github.com/vbalashi/2000nl/actions/runs/35854847126).
The run produced no learner-content output and changed no production state.

## Idle follow-up probe (2026-09-23)

After an idle gap, a one-sample run of the same workflow again measured the
first public plan at **2,241.907 ms**. The same physical backend then completed
the `next`, `filtered`, aggregate, and candidate components in **204.213 ms**,
**207.046 ms**, **408.252 ms**, and **230.413 ms** respectively. PostgreSQL
17.6, `work_mem=2184kB`, JIT off, zero shared reads, and 280/564 temporary
read/write blocks matched the earlier run.

This makes the first-use shape repeatable after idle time, while the following
calls on that backend remain fast. It strengthens the backend/pooler/runtime
initialization hypothesis; it still cannot distinguish backend startup from
pooler routing or host scheduling. Workflow run:
[35856210739](https://github.com/vbalashi/2000nl/actions/runs/35856210739).

## Synchronized activity telemetry

The readiness workflow now starts `scheduler_activity_sampler.mjs` alongside
the bounded read-only probe for 30 seconds. The sampler reads only aggregate
`pg_stat_activity` fields: backend PID/start, query start, state, wait type/event,
and an allowlisted scheduler query class. It deliberately excludes SQL text and
all learner/content payloads. This is the next attribution boundary: an active
backend with a wait event during the first call points toward runtime/resource
or pooler scheduling, while an active backend without a wait event leaves query
execution as the remaining database-side hypothesis. The sampler itself does
not reset statistics, change settings, or mutate data.

The first production run with the sampler was
[35857186766](https://github.com/vbalashi/2000nl/actions/runs/35857186766),
with three readiness samples. During the slow first public plan
(`1821.433 ms`, backend `2207693`, query start `2026-09-23 11:53:54.093 UTC`),
the sampler observed an active `session-plan` backend with both
`waitEventType=null` and `waitEvent=null`; it disappeared after the call
completed. A later `filtered-card` backend was observed with the same empty
wait fields. No sampled scheduler call exposed a lock, I/O, or timeout wait
event. The diagnostic still showed the usual first-call shape: the first public
call was slow, later calls were roughly 143–201 ms, and shared reads stayed at
zero.

This makes a visible PostgreSQL lock/I/O wait less likely for this occurrence
and moves the leading hypothesis toward CPU/runtime execution, backend
initialization, or pooler routing. `pg_stat_activity` cannot rule out host-level
CPU scheduling between samples, and the sampler does not prove the exact owner.
The sampler emitted no SQL text or learner data; no production state or
configuration changed.

## Production host correlation (2026-09-23)

PR #428 added a second bounded companion to the readiness workflow. It reads
only aggregate Linux `/proc` metrics from the self-hosted runner: load,
CPU-window percentages, memory availability, and CPU/I/O pressure. It does not
read process command lines, environment variables, SQL, credentials, or learner
data. The workflow still runs the database probe and activity sampler when the
runner lacks `/proc`.

Two one-sample runs were then executed against the unchanged production
database. The first run, [35859292253](https://github.com/vbalashi/2000nl/actions/runs/35859292253),
measured the public session-plan at **1,584.773 ms** on backend `2208886`
(backend start `2026-09-23 12:15:05.703736 UTC`). The activity sampler observed
that backend active as `session-plan` with `waitEventType=null` and
`waitEvent=null`. During the roughly two-second interval, host load was about
`0.75`, memory available about `12.8 GB` of `16.3 GB`, CPU PSI `9–12%` with no
full CPU pressure, and IO PSI `2–4%`; short CPU windows included some I/O wait
but no sustained saturation.

The second run, [35859394020](https://github.com/vbalashi/2000nl/actions/runs/35859394020),
used the **same backend PID and start time** and measured the first public
session-plan at **185.267 ms**. Its host load and PSI were actually higher
(load up to `1.72`, CPU PSI up to `15.37%`, IO PSI up to `5.92%`), yet the
query was fast. The sampler did not catch an active query because the calls
completed too quickly.

This paired result makes host-wide CPU/RAM/I/O saturation an insufficient
explanation for the first-call pause. It strengthens the backend-local runtime
initialization or pooler lifecycle hypothesis while leaving the exact owner
unproven. No production state, database setting, or timeout changed.

## Exact UI overload comparison (2026-09-23)

The readiness diagnostic now includes the exact eight-argument overload used by
the UI (`p_session_size='10'`, `p_new_review_ratio=2`) and can choose whether
that overload or the six-argument public/deploy path runs first. This matters
because both calls share backend-local caches and the order can change the
observed first-call timing.

In [35860010208](https://github.com/vbalashi/2000nl/actions/runs/35860010208),
the six-argument public call ran first and took **1,311.385 ms** on backend
`2209460`; the eight-argument UI call immediately after it took **192.125 ms**
on that same backend/start. This is an order-sensitive comparison, not a cold
UI result.

The UI-first run
[35860409669](https://github.com/vbalashi/2000nl/actions/runs/35860409669)
measured the UI overload at **206.003 ms**, then the public call at **179.730
ms**, both on new backend `2209483`. A three-sample UI-first run
[35860495548](https://github.com/vbalashi/2000nl/actions/runs/35860495548)
kept the same backend and measured UI **186.626 / 206.052 / 182.824 ms** and
public **191.419 / 187.706 / 193.038 ms**. No call timed out and the activity
sampler saw no wait event during the short UI calls.

This series makes the six-argument public/deploy path the more repeatable
cold-first outlier in the current workflow. It does not erase the earlier
direct eight-argument UI observation at 1.949 s; that historical outlier still
needs a matching idle/backend reproduction before any code change is justified.
The production database and learner state remained read-only throughout.

## Controlled-idle UI reproduction (2026-09-23)

After approximately five minutes without readiness calls, the same workflow ran
the exact eight-argument UI overload first in
[35861721662](https://github.com/vbalashi/2000nl/actions/runs/35861721662).
The first UI call took **1,805.719 ms** on new backend `2210081` (started at
`2026-09-23 12:38:17.924465 UTC`). The six-argument public call immediately
after it took **193.346 ms** on that same backend/start. This reproduces the
cold-first effect on the actual UI contract after idle.

The activity sampler observed the slow UI `session-plan` active with
`waitEventType=null` and `waitEvent=null`. During the slow interval, host load
was about `1.02`, memory available about `12.8 GB` of `16.3 GB`, CPU PSI about
`1–4.6%` with no full CPU pressure, and IO PSI about `0.9–2.4%`. The result
therefore makes host-wide saturation, visible lock waits, and visible I/O waits
insufficient explanations. The remaining boundary is backend/pooler/runtime
initialization timing; no production state or configuration changed.

## Server execution versus outer wrapper time (2026-09-23)

The readiness probe now reports PostgreSQL `Execution Time` separately from the
outer wall-clock time of the client invocation. In
[35862404089](https://github.com/vbalashi/2000nl/actions/runs/35862404089),
the UI-first call measured **2,141.285 ms** inside PostgreSQL and **3,567.791
ms** outside it. The following public call on the same backend measured
**196.336 ms** inside PostgreSQL and **1,661.474 ms** outside it.

The apparent outer overhead was about **1.43–1.47 s** for both calls. The
production workflow starts a fresh digest-pinned ephemeral `psql` container for
each sample, so this part includes container/client startup and any
connection/pooler time; it is not a pure pooler measurement. The meaningful
delta is therefore server-side: the PostgreSQL execution itself grew from about
196 ms to 2.141 s on the first UI call. This moves the remaining investigation
inside the backend execution/runtime path. No SQL, timeout, setting, or
production state changed.

## Isolated nested function timing (2026-09-23)

The disposable session-plan fixture now enables PostgreSQL `track_functions` for
the measured transaction and reads aggregate `pg_stat_user_functions` deltas
after the connection closes. It records function names, call counts, and total
and self time only; it does not emit learner or card data. Both production
contracts are exercised: the six-argument public call and the exact eight-
argument UI call (`p_session_size='10'`, `p_new_review_ratio=2`).

On the current synthetic 18,184-entry / 4,031-NT2 corpus, the six-argument
call took **85.355 ms** in PostgreSQL. The public wrapper accounted for
**85.287 ms**, with `private.training_scheduler_candidates_v2` at **83.085 ms**
(**81.913 ms** self time); timezone and filter helpers were each about 1.2 ms
or less. The eight-argument UI call took **88.792 ms**. Its
`private.training_session_members_v1` path accounted for **87.894 ms**, while
the nested scheduler candidate function accounted for **82.172 ms**. These
function totals overlap because callers include the time of nested functions;
they must not be added together.

The isolated fixture therefore has no nested function consuming seconds and
does not reproduce the production first-call pause. This is evidence against a
deterministic multi-second scheduler helper regression in the fixture, but it
does not model the production pooler lifecycle, backend state, physical cache
history, or host runtime. The experiment narrows the remaining boundary to
production backend/runtime or connection lifecycle behavior rather than
supporting a SQL rewrite. The local test remains read-only during measurement
and cleans up its disposable database.

## Constrained resource experiment (2026-09-23)

To test whether a simple resource ceiling is sufficient to recreate the first-
call pause, the disposable fixture was run against a separate PostgreSQL 17.6
container using the same Supabase PostgreSQL image family, capped at **1 CPU and
2 GB RAM**. The shared local Supabase instance, QA database, and production
database were not used or changed. The container was removed after the run.

The current **six-argument public session-plan** integration test passed. Its
three direct calls measured **87.793 / 87.032 / 88.056 ms**, with the expected
first-call read pattern (19 shared reads, then zero) and the existing
temporary-write shape. The fixture therefore stayed bounded even under this
representative constrained profile and did not reproduce the production
near-two-second first call. The eight-argument UI overload was not exercised by
this run and remains part of the separate production attribution plan.

This is evidence against a generic 1-CPU/2-GB ceiling as the sole cause. It is
not a production resource match: the actual host limits, storage behavior,
pooler lifecycle, and CPU scheduling profile remain unknown. The next useful
experiment therefore needs synchronized production host/pooler telemetry or a
more faithful isolated profile, rather than a SQL rewrite or a larger release
timeout.

## Repeated UI-first production probe (2026-09-23)

After the isolated nested timing result, the read-only workflow was run again
with the exact eight-argument UI overload first and three samples:
[35864272860](https://github.com/vbalashi/2000nl/actions/runs/35864272860).
The UI path measured **1,596.053 ms**, then **186.082 / 197.916 ms**. All UI
and following public samples 1–3 used backend `2211863`, started at
`2026-09-23T13:01:54.723839Z`; the following six-argument public path measured
**176.465 / 176.922 / 176.221 ms**.

The activity sampler caught the slow `session-plan` backend active with
`waitEventType=null` and `waitEvent=null` (`queryStart=2026-09-23T13:01:56.782319Z`).
The host sampler around that interval reported load about `0.25`, roughly
`12.7 GB` available out of `16.3 GB`, CPU PSI up to `5.09%`, and I/O PSI up to
`1.65%`; it did not show host-wide saturation. Outer wrapper overhead stayed
roughly **1.30–1.45 s** for both the slow and warm samples, while server-side
execution changed from **1.596 s** to about **0.19 s**.

This is another reproduction of the backend-local first-call effect on the
actual UI contract. It does not show a PostgreSQL lock or I/O wait and does not
prove that the pooler owns the delay because each workflow sample still starts
a fresh client container. SQL, timeout, settings, and production state were
unchanged. Evidence is recorded in
[issue #413](https://github.com/vbalashi/2000nl/issues/413#issuecomment-5795335156).

## Repeatable local feedback loop

```sh
SESSION_PLAN_BENCHMARK_BASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  node --test db/scripts/session_plan_latency.integration.test.mjs
```

The loop creates and drops its own uniquely named database. It uses current
bootstrap, 18,184 wide entries / 4,031 NT2 entries, one source binding and two
root nodes per entry, distributed dirty source/projection pages, mixed learner
queues, and the observed 2,184 kB memory limit. It checks nonempty expected
queues, samples the actual public RPC on separate direct local connections,
then runs the exact current manifest probe on another connection without a
preceding warm-up call. The production JIT setting, `DISCARD PLANS`, read-only
transaction, and 2,000 ms bound are retained.

Fixture content is synthetic: every entry has its own source group and both a
definition and example. It does not reproduce production sibling distribution,
all content types, runtime resource limits, transaction pooling, or physical
cache eviction. Root nodes are bulk-loaded with session-local trigger bypass
only inside the disposable fixture; all entries have both nodes, so the
exception-only unrenderable projection correctly remains empty. Runtime reads
use normal trigger settings. This is not an importer regression test (#397).

Measured current-plan calls are about 85–110 ms and 5,270 shared blocks, with
166 temporary blocks written. A 6,500-block bound allows catalog/plan variation
while catching a return to wide/per-candidate scanning. It is a separate
current-contract fixture budget; the historical v1 test's 4,000-block budget is
unchanged. The harness also injects a 2.1-second delay into the disposable RPC
and verifies the 2-second timeout is detected. This proves the feedback loop
can fail on the symptom; it does **not** reproduce the production cause.

## What remains and next experiment

No scheduler migration is justified yet. Current evidence ranks backend-local
runtime initialization or pooler lifecycle above host-wide resource saturation
and persistent query-volume regression. The isolated nested timing experiment
found no multi-second helper in the representative fixture, so nested function
execution is now separated from the remaining production-only boundary.

The constrained profile, synchronized host sampler, exact UI-overload
comparison, controlled-idle UI reproduction, server/outer timing split, and
nested function timing have now been completed. The next useful evidence is
pooler/backend lifecycle correlation around an idle-to-first-call transition:
keep production checks read-only, capture backend PID/start and activity state,
and compare a fresh or reused backend with the same exact UI overload. Do not
enable invasive tracing or change runtime settings there. Reproduce the
near-two-second server-side first-call behavior before changing SQL or release
timeout; compare one variable at a time. Restart/evict caches only on the
isolated instance, never on the shared QA or production database.

If the isolated instance cannot reproduce it, the next missing evidence is
pooler/backend lifecycle telemetry that can distinguish a backend-local runtime
event from connection routing. Query counters and host load alone cannot make
that attribution. Do not increase the release timeout, add warm-up retries, or
treat the issue as completed on the strength of passing local tests.

## Production rollout timeout after migration 158 (2026-09-24)

Security PR [#450](https://github.com/vbalashi/2000nl/pull/450) merged as
`b6b23a798869b9f9c5bbfeb769728f1e9862f3ca`, which triggered the normal NUC
workflow [35953070335](https://github.com/vbalashi/2000nl/actions/runs/35953070335).
The immutable migration gate applied migration 158 and then the existing
pre-switch read exceeded its unchanged **2,000 ms** statement timeout. The
container switch did not run. This is a production failure of the six-argument
public `get_training_session_plan(uuid,text[],uuid,text,text,jsonb)` probe, not
the eight-argument UI overload used in several earlier diagnostic samples. The
PostgreSQL error context names `private.training_scheduler_candidates_v2`
under `get_training_session_plan`; the logged SQLSTATE is `57014` at
`2026-09-24T03:54:27.229Z`.

A bounded Supabase unified-log query targeted the exact 30-second window
`03:54:10Z–03:54:40Z` for project `2000nl` (`lliwdcpuuzjmxyzrjtoz`). It found
11 PostgreSQL, 14 PostgREST, and 7 Supavisor events. The PostgreSQL stream had
one `ERROR` with SQLSTATE `57014` and the scheduler-helper context. The
Supavisor stream recorded `auth_scram_final_wait` at `03:54:22.286Z` and
`03:54:22.293Z`, followed by `busy` at `03:54:27.261Z`; these are event labels,
not measurements of queue duration, and do not prove that the pooler caused
the statement delay. The failed deployment did not capture a correlated backend
PID/start or wait-event sample. No query text, arguments, user identity, or
learner rows were retrieved from Supabase logs/catalogs.

The deployment contract state now records `2000nl-db-158:158`. Read-only
catalog verification found RLS enabled and not forced on
`public.user_training_scopes`, zero direct policies, zero effective table or
column grants for `PUBLIC`/`anon`/`authenticated`, and authenticated-only
execution of the two owner-checking scope RPCs. No user rows were read. The
still-running app answered as release `0.18.735`, commit `0b69c69968bbed42b8082e6594e2886da7c16e72`, but its health endpoint now reports
`status: warning`: it expects contract 157 while the database is at 158. The
platform RPC and grouped-search checks are `ok`; the exact deployment contract
check is not. The app container was not switched during this workflow.

This adds a concrete failed sample to #413 but does not identify its root
cause. The error establishes that PostgreSQL cancelled work inside the
scheduler candidate path; it does not distinguish query/data-shape cost,
backend-local execution behavior, or short-lived resource pressure. The
Supavisor events do not establish connection wait as the cause. Do not retry
the deployment unchanged, increase the timeout, or change SQL based only on
this event. Before another rollout attempt, define one discriminating,
bounded measurement for the **six-argument pre-switch path** that can capture
backend identity/start and activity/wait state around the first call, while
keeping the normal two-second release gate. Preserve the already-applied
forward migration 158; do not reverse its grants or disable RLS. Recheck the
health contract after a later successful deployment.

## Synchronized single-sample pre-switch-path probe (2026-09-24)

Because run 35953070335 newly failed on the six-argument deployment overload,
one bounded, read-only diagnostic was run with `samples=1` and
`first_component=public`, retaining the existing 2,000 ms statement timeout
and starting the activity/NUC samplers at the same time:
[35954125190](https://github.com/vbalashi/2000nl/actions/runs/35954125190).

The six-argument public session-plan call took **1,674.470 ms of PostgreSQL
execution**, below the gate but close to it; outer client wall time was
**3,092.777 ms** with **1,418.307 ms** outside server execution. Planning was
**0.121 ms**, with **8,356 shared buffer hits / 0 reads**, **280 temp blocks
read / 564 written**, JIT off, and `work_mem=2184kB`. The sampler saw backend
`2266384` active as `session-plan` at
`2026-09-24T04:05:14.297690Z`, with backend start
`04:05:12.127193Z` and both wait-event fields null. The next activity sample
found no active query. On that same backend, the following UI/public overload
executed in **197.524 ms**; next, filtered, aggregate, and candidate components
were **203.970 / 193.370 / 189.361 / 181.864 ms**. This is one observed sample,
not a percentile or proof of root cause.

NUC-runner samples during the 30-second window showed load up to about `0.8`,
roughly `12.7 GB` available of `16.3 GB`, CPU PSI some up to `9.68%` with full
pressure `0`, and I/O PSI some up to `3.54%`. These describe the diagnostic
runner, not the managed Supabase database, so they cannot exclude pressure on
the database host.

The Supabase unified logs for `04:05:00Z–04:05:30Z` contained 52 Supavisor
rows, 16 Edge, 2 Auth, and 1 PostgREST row, with no PostgreSQL error and no
Supavisor `busy` event in that window. One Supavisor row matched backend PID
`2266384`; it was recorded at `04:05:12.177929Z` in `transaction` mode and
region `eu-west-1`, about 51 ms after backend start. No logged wait duration
or matching pooler-busy event explains the later SQL execution time. Logs
contained no query text, arguments, user identity, or learner rows.

This strengthens the conclusion that the observed near-threshold portion is
inside PostgreSQL execution rather than client/container wall time. It weakens
pooler saturation and NUC-wide load as explanations for this occurrence, but
it does not measure Supabase CPU/memory/disk at query time and cannot distinguish
backend-local execution state from query/data-shape cost or short-lived database
resource pressure. It does not justify a dedicated compute move, SQL rewrite,
or a larger gate. Do not repeat this first/warm sequence without new
hypothesis-discriminating evidence; keep #413 open and use the unchanged gate
for a later rollout only after the cause or an existing fix is reviewed.

## Independent-backend gate reproduction (2026-09-24)

A second bounded read-only run, [35955022754](https://github.com/vbalashi/2000nl/actions/runs/35955022754), used the same `samples=1`, `first_component=public` setup and unchanged 2,000 ms statement timeout. It ran on backend `2267020`, started at `04:17:37.645388Z`, distinct from `2266384` in the prior sample. PostgreSQL execution was **2,261.464 ms**, exceeding the release gate; outer client time was **4,230.948 ms**. Planning was **0.108 ms**, shared buffers were **8,356 hits / 0 reads**, and temporary blocks were **280 read / 564 written**—the same aggregate block counts as the preceding backend. The activity sampler observed the exact backend as an active `session-plan` with both wait-event fields null. This is a second distinct-backend reproduction, not a percentile estimate.

For `04:17:25Z–04:17:55Z`, the verified Supabase project's unified logs returned 45 Supavisor rows, one containing backend PID `2267020`, in `transaction` mode / `eu-west-1`; the window had no `busy` label match, PostgreSQL error, or `57014` timeout code. This rules out a visible pooler `busy` event for this occurrence, not all pooler or database-resource effects. The synchronized NUC runner sampler showed a 1-minute load maximum of `1.82`, at least `12.7 GB` available memory, CPU PSI some up to `6.73%`, and I/O PSI some up to `4.75%`; these are runner measurements, not Supabase telemetry.

Together with the 1,674.470 ms call on backend `2266384`, the result confirms that first-call PostgreSQL execution varies across distinct backends and can cross the two-second deployment gate without a reported wait event. Identical buffer/temp-block aggregates suggest the visible data-access work is similar, but they do not identify which internal function or execution state accounts for the timing difference. The available logs still lack per-request database CPU, memory, disk, and nested-function timing. Keep #413 as the immediate rollout gate; do not raise the timeout, retry deployment unchanged, or infer that dedicated compute is required. The next useful step is to check whether the NUC runner's dedicated diagnostic connection permits transaction-local nested timing; if not, choose another privacy-safe attribution method without changing project-wide settings.

A separate read-only settings/catalog query through the Supabase MCP returned `track_functions=none`, `pg_stat_statements.track=top`, the `pg_stat_statements` extension installed, and no `pg_stat_user_functions` row for `private.training_scheduler_candidates_v2`. A transaction-local `set_config('track_functions','all',true)` probe through that same MCP was rejected with SQLSTATE `42501` (`permission denied to set parameter "track_functions"`); no database setting was changed. The currently available MCP role therefore cannot provide nested function timing this way. Any further attempt needs a separately authorized diagnostic connection or another privacy-safe method; do not change project-wide production settings for this investigation.

## Production nested-function attribution (2026-09-24)

The existing NUC diagnostic connection was verified as the expected Supabase
project (`lliwdcpuuzjmxyzrjtoz`) through the transaction pooler in eu-west-1;
it is distinct from the less-privileged MCP role. A one-second read-only
permission probe confirmed this connection accepts `SET LOCAL
track_functions = 'all'`. A disposable local Supabase transaction confirmed
that `pg_stat_xact_user_functions` reports nested timing before rollback.
Neither check changed a project-wide setting.

One production read-only transaction then enabled that setting locally, kept
JIT off, used only the dedicated QA identity, and bounded the six-argument
public plan call at 3,000 ms for attribution. Its backend was PID `2270559`,
started `2026-09-24T05:23:39.763406Z`. The PostgreSQL EXPLAIN execution was
**2,038.121 ms**, planning **0.120 ms**, with 8,440 shared hits / zero reads
and 280/564 temporary read/write blocks. Transaction-local function timing:

| Function | Calls | Total | Self |
| --- | ---: | ---: | ---: |
| `public.get_training_session_plan` | 1 | 2,036.780 ms | 34.972 ms |
| `private.training_scheduler_candidates_v2` | 1 | 1,927.420 ms | **1,917.624 ms** |
| `private.training_filter_target_date` | 2 | 74.838 ms | 1.502 ms |
| `private.training_filter_target_date_at` | 2 | 68.546 ms | 2.207 ms |
| `private.training_user_timezone_v1` | 9 | 62.496 ms | 57.673 ms |

The dominant time is inside the candidate helper's **self** time, which
includes its SQL execution and unreported internal planning/initialization;
these counters do not distinguish those subparts or prove database-host
resource pressure. The function totals overlap across callers, so they must
not be summed. Instrumenting function calls adds some overhead, and this
3,000 ms diagnostic is not an unchanged replay of the 2,000 ms deployment
gate. It nevertheless localizes the near-threshold execution far more tightly
than the outer EXPLAIN or aggregate logs. No learner/card payload or credential
was printed, no progress action was submitted, and the transaction rolled back.

The next probe should compare first and immediate repeat calls on the **same
backend**, with per-call `pg_stat_xact_user_functions` deltas, and then inspect
the candidate helper's inner SQL plan or compilation behavior. Do not change
the release gate, global DB settings, or compute size on this evidence alone.

That same-backend comparison was subsequently run in a single read-only
transaction on PID `2270559` (identical backend start). It measured the public
plan at **232.519 ms** on the first invocation of this transaction and
**175.354 ms** on the immediate second invocation. The candidate helper's
per-call self time was **199.699 ms** and **171.465 ms** respectively. The
backend had already executed the 2,038 ms instrumented call above. Thus the
expensive candidate self time was absent when that physical backend was reused,
even though each invocation still executed the same function. This is
consistent with a backend-local first-use/idle effect but does not prove it or
separate SQL statement planning from execution or short-lived managed-host
pressure at the first use.
`training_scheduler_candidates_v2` is a SQL-language, security-definer helper
with a large CTE query; its `self_time` covers the inner query. Next inspect
its actual inner plan/compilation on a slow first use before changing SQL.

Supabase's documented transaction-local `auto_explain` path was then checked.
The managed connection already had the module loaded and accepted local
`log_nested_statements`, `log_analyze`, `log_buffers`, JSON format, and a
100 ms threshold at `NOTICE` level. Server `log_min_messages` was `warning`,
so this client-directed NOTICE level was below the server log threshold. One
bounded read-only QA transaction on **another backend**, PID `2271126`
(started `2026-09-24T05:29:14.193939Z`), produced a **fast** public call:
268.528 ms execution / 0.125 ms outer planning. The nested candidate plan
took 203.640 ms: a `WindowAgg` over 2,345 output rows, with a nested sort over
16,396 rows and the familiar 280/563 temporary blocks. The wrapper aggregate
was 245.863 ms. This is a warm-speed inner-plan reference, **not** a plan
captured during a two-second outlier. In particular, a recently started
backend can also be fast; backend age/first use alone is not a sufficient
explanation. Avoid attributing the outlier to compilation or memory pressure
without a matched slow inner plan. The diagnostic printed only node types,
counts, blocks and timing; it did not output SQL text or learner content.

The disposable local timing fixture now keys before/after function-stat deltas
by PostgreSQL function OID instead of schema and name, because the public
planner has multiple overloads. It also requires one positive-call row for
the exact six- or eight-argument wrapper and the candidate helper in each
measurement; missing or misattributed rows fail the test. The 2026-09-24 local
run passed on a disposable 18,184-entry corpus: the six-argument wrapper took
103.226 ms and the eight-argument wrapper 107.065 ms, with the candidate
helper called once in each. This repairs diagnostic attribution but does not
explain or remove the production two-second outlier.

## Bounded inner-plan trace preparation (2026-09-24)

The CLI connection was rechecked against the same expected project ref,
eu-west-1 transaction pooler, and PostgreSQL 17.6. A new diagnostic command,
`node db/scripts/session_plan_inner_trace.mjs --env-file <private-env-file>`,
executes exactly one six-argument public-plan call under the QA identity in a
read-only transaction. It bounds that diagnostic call at 3,000 ms, enables
`track_functions` and `auto_explain` only with `SET LOCAL`, and reports only
aggregate timing, backend identity, and plan-node counts. The exact 2,000 ms
deployment gate is unchanged. Parser tests assert that SQL/query text is never
included in the emitted summary.

Three bounded invocations were made while validating the parser. The first
returned an output-parsing error after its result was discarded; it supplies
**no usable timing evidence**. The next two used the same backend PID `2276584`
(started `07:02:41.805Z`) and were fast: **210.008 ms** and **205.811 ms**
inside PostgreSQL, with outer planning **0.116/0.110 ms**. Candidate-helper
self time was **204.678/201.323 ms**. This is another warm-speed reference,
not a matched slow inner plan. The server emitted three `auto_explain` plan
notices in the last invocation, but the initial parser incorrectly expected a
JSON array; PostgreSQL's `auto_explain` JSON log is an object. The parser now
accepts both shapes, scopes each notice to its own plan, and has synthetic
privacy/attribution tests. No further production call was made in this bounded
round merely to recheck parsing.

The next useful call is one bounded, post-idle QA trace with the corrected
parser. If it captures a slow candidate, compare its logged inner-plan time
with transaction-local candidate self time on that **same call**. A slow inner
plan points to execution; a fast inner plan paired with slow self time points
to planning or initialization outside the logged execution. Do not infer a
resource upgrade from either result alone.
