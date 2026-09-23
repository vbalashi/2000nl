# Issue 440: managed Supabase and Training latency attribution

Date: 2026-09-23. Scope: bounded, read-only evidence review; no runtime change,
production probe, deployment, or database setting change in this issue branch.

## Architect conclusion by path

**#413 — session-plan / deployment gate.** The read-only SQL readiness probe
called the eight-argument UI overload with UI arguments; those PostgreSQL
executions repeatedly took about 1.6–2.1 seconds on the first observed call,
then about 0.18–0.20 seconds on later calls using the same backend. This
establishes a production first-use SQL execution-time symptom. It
does not establish that managed Supabase capacity caused the delay. The
dashboard confirms a shared `t4g.nano` compute tier and a Free-plan database
quota warning; those are real capacity risks, but the dashboard samples are not
time-correlated with the slow SQL calls. Available Linux `/proc` telemetry
belongs to the self-hosted NUC runner, not the managed database.
`pg_stat_activity` showed no wait in particular snapshots; that does not rule
out short waits or resource pressure. Synthetic local function timing does not
clear production SQL/data-shape, query planning, or authenticated PostgREST
behavior. Keep the 2,000 ms deployment gate unchanged and do not rewrite SQL on
this evidence alone.

The inspected Query Performance page does not list the #413
`get_training_session_plan` probe in the supplied top-query rows. Its aggregate
entries concern other RPCs and cannot replace or explain the direct SQL timings
above.

**#421 — first actionable card.** Two authenticated browser traces on the same
release show several seconds in the Supabase upstream for training statistics
and card selection, followed by a slow Platform V2 lookup. The request path is
server-side enough that browser rendering/network setup is not the dominant
reported interval. The evidence does not separate managed database resource
limits from the individual SQL/RPC work or PostgREST/API layers. The UI can
present setup while work continues, but background loading would reduce time to
an available screen, not prove or eliminate the slow path to the first usable
card. The 24-hour Query Performance aggregate also shows high mean and maximum
times for `get_detailed_training_stats`, `get_next_card`, and
`read_platform_v2_training_group`; it supports investigating these DB paths,
but does not explain either first-card trace by itself.

**Dedicated compute / migration:** Supabase is verified in West EU (`eu-west-1`)
on shared `t4g.nano` compute, with a 0.5 GB RAM ceiling and a Free-plan database
quota warning showing 0.518/0.5 GB (104%). This justifies treating capacity and
quota as material risks and checking storage usage. It does not show that either
caused the observed latency: the dashboard readings are not aligned to the
slow-request timestamps. No dedicated-node or paid-compute change is justified
until time-correlated resource metrics and matched HTTP/SQL evidence are
available. The app/NUC geographic region remains unknown.

## Verified paths and missing equivalence

- The production UI calls `get_training_session_plan` and
  `get_detailed_training_stats` through the browser Supabase client
  (`apps/ui/lib/training/selectionService.ts`,
  `apps/ui/lib/training/statsService.ts`). These are authenticated PostgREST
  RPC calls.
- The first-card trace's Platform V2 route calls
  `read_platform_v2_training_group` through the server-side service Supabase
  client (`apps/ui/lib/platform/platformV2LookupService.ts`). This has a
  different database role boundary from the browser RPCs.
- The readiness workflow runs on `runs-on: self-hosted` and reads
  `SUPABASE_DB_URL` from the NUC's private `.env`. Historical diagnostic output
  identifies port 6543 (transaction pooler). Each sample starts a new
  digest-pinned `psql` container, so outer time includes client/container
  startup, connection/TLS, and any pooler overhead. It is not a pure pooler
  measurement.
- The readiness SQL sets `request.jwt.claim.sub` but does not switch to the
  PostgREST `authenticated` database role. It is therefore not a role/RLS
  equivalent of the UI RPC. It also does not measure the UI's actual HTTP
  PostgREST request for the session planner.
- The production project reference in source is `lliwdcpuuzjmxyzrjtoz`. The UI
  is deployed to the NUC (`DEPLOY_SERVER_NAME` in `deploy-nuc.yml`); its
  geographic location is not documented.

**Verified dashboard capacity observations (2026-09-23).** After the project
owner authenticated in the existing Chrome profile, the 2000nl project
(`lliwdcpuuzjmxyzrjtoz`) showed primary DB region West EU (Ireland),
`eu-west-1`, shared `t4g.nano` compute, up to 0.5 GB RAM, and disabled compute
scale controls on the Free plan. An infrastructure snapshot showed CPU 3%,
memory 52%, disk 17%, and 9/60 connections. The Sep 16–23 dashboard trend showed
compute 47%, CPU 42%, memory 47%, and disk I/O 0%. It also showed DB 493.7 MB,
WAL 720 MB, system 171.1 MB, and disk 1.35/8 GB. Separate organization/project
usage views showed Free plan and DB 0.518/0.5 GB (104%) with an exceeded-quota
warning. The DB-size figures differ across dashboard views; they are recorded
as displayed and not reconciled here.

These are verified capacity/quota observations, not a latency attribution. The
snapshot/trend are not correlated to the timestamps of runs 35862404089,
35861721662, 35864272860, or the #421 HTTP traces. The management CLI remains
unavailable: `supabase projects list` returned `Access token not provided.
Supply an access token by running supabase login or setting the
SUPABASE_ACCESS_TOKEN environment variable.` In the initial agent attempt the
dashboard deep link redirected to `/dashboard/sign-in?returnTo=...`; the owner
later authenticated in the existing profile and inspected the project. No
credentials or secret values were read or printed, and no production DB request
was used to compensate for the missing time correlation.

**Aggregated Query Performance observations.** Supabase Observability → Query
Performance was inspected for **2026-09-22 14:11:05.597Z through 2026-09-23
14:11:05.597Z** (24 hours). The overview reports **259 queries over 1 second**,
**99.70%** overall cache hit, and **315.7** average rows per call. Relevant
entries are:

| Query | Calls | Mean | Max | Total tracked time | Share of tracked DB time |
|---|---:|---:|---:|---:|---:|
| `read_platform_v2_training_group` | 3,439 | 710 ms | 7,863 ms | 40m42s | 20.3% |
| `get_detailed_training_stats` (user + modes + list/type) | 1,027 | 1,997 ms | 7,950 ms | 34m11s | 17.1% |
| `get_next_card` (8-argument overload) | 912 | 1,625 ms | 7,925 ms | 24m42s | not supplied |
| `get_next_card` (9-argument overload) | 416 | 2,155 ms | 7,753 ms | 14m56s | not supplied |

These are `pg_stat_statements`-style aggregates over the full 24-hour window,
not per-request spans, percentiles, or a causal join to the #413 run IDs or
#421 browser traces. The names and overloads above are distinct from #413's
`get_training_session_plan` SQL probe. Treat them as evidence that several
first-card DB paths deserve investigation, not proof that they caused a
particular slow first request.

The selected `get_detailed_training_stats` detail panel identifies database
role `authenticated` and application `n/a`. The role matches the one used by
PostgREST for authenticated RPCs; the `n/a` application field prevents
attributing the aggregate to a particular client. It does not identify the QA
user, match arguments/results to either #421 trace, or establish equivalence
with the direct-SQL probe.

## Sanitized observed samples

These are individual samples, not a population percentile. Exact timestamps,
request IDs, HTTP status codes, and full parameter payloads were not retained in
the linked issue comments. The first-card browser traces reported no error, but
per-request status codes are absent from the record.

### #413: direct PostgreSQL diagnostic via the production transaction pooler

| Run | Path / order | PostgreSQL execution | Outer client wall time | Backend / result |
|---|---|---:|---:|---|
| [35862404089](https://github.com/vbalashi/2000nl/actions/runs/35862404089) | 8-arg UI overload, first | 2,141.285 ms | 3,567.791 ms | backend 2210671; completed |
| [35862404089](https://github.com/vbalashi/2000nl/actions/runs/35862404089) | 6-arg public overload, next | 196.336 ms | 1,661.474 ms | same backend; completed |
| [35861721662](https://github.com/vbalashi/2000nl/actions/runs/35861721662) | 8-arg UI overload after ~5 min idle | 1,805.719 ms | not recorded | backend 2210081; completed |
| [35861721662](https://github.com/vbalashi/2000nl/actions/runs/35861721662) | 6-arg public overload, next | 193.346 ms | not recorded | same backend; completed |
| [35864272860](https://github.com/vbalashi/2000nl/actions/runs/35864272860) | 8-arg UI overload: first / repeat 1 / repeat 2 | 1,596.053 / 186.082 / 197.916 ms | not retained per sample; outer overhead reported at about 1.30–1.45 s | same backend 2211863; completed |
| [35864272860](https://github.com/vbalashi/2000nl/actions/runs/35864272860) | 6-arg public overload: repeat 1 / 2 / 3 | 176.465 / 176.922 / 176.221 ms | not retained per sample; outer overhead reported at about 1.30–1.45 s | same backend; completed |

For run 35864272860, NUC-runner telemetry around the slow call showed load
about 0.25, around 12.7 GB available of 16.3 GB, CPU PSI up to 5.09%, and I/O
PSI up to 1.65%. This is runner telemetry only; no Supabase host metrics were
collected. The activity snapshot had no wait event. Per-sample client wall
times were not retained, so they are not reconstructed from aggregate overhead.

Across the listed #413 samples, the eight-argument SQL path has **n=5**
observations and a maximum of **2,141.285 ms**; this includes the first and two
repeat observations in run 35864272860. The adjacent six-argument path has
**n=5** and a maximum of **196.336 ms**; these are warm/adjacent calls, not a
cold-start maximum. The canonical #413 report separately records a
**1,584.773 ms** first call for the public six-argument path. No listed
readiness sample timed out. For #421, the two traces contain **n=2** each for
`get_detailed_training_stats` (max **4,329 ms**), `get_next_card` (max
**5,108 ms**), and first lookup (max **4,799 ms**); the second trace also has
two later lookups (max **3,008 ms**). The traces report no errors, but status
codes were not retained. These counts are small observed samples, not
percentiles.

### #421: authenticated first-card browser path

These are the #421 HTTP samples only; they are not a matched direct-SQL
baseline for either incident. The comments retain per-stage durations but not
the role/parameter record required to compare them as equivalent requests.

| Trace | Component | Client time | Reported upstream / server timing | Observed outcome |
|---|---|---:|---:|---|
| [First trace](https://github.com/vbalashi/2000nl/issues/421#issuecomment-5793913618) | `get_detailed_training_stats` | ~3,710 ms | `x-envoy-upstream-service-time` ~3,657 ms | no error reported; status not retained |
| [First trace](https://github.com/vbalashi/2000nl/issues/421#issuecomment-5793913618) | `get_next_card` | ~4,760 ms | upstream ~4,703 ms | no error reported; status not retained |
| [First trace](https://github.com/vbalashi/2000nl/issues/421#issuecomment-5793913618) | first `/api/platform/v2/lookup` | ~4,570 ms | `route.total` ~4,510 ms; `route.operation` ~3,686 ms; `lookup.exact-group` ~3,204 ms | no error reported; status not retained |
| [Second trace](https://github.com/vbalashi/2000nl/issues/421#issuecomment-5794169120) | `get_detailed_training_stats` | 4,329 ms | upstream 4,285 ms | no error reported; status not retained |
| [Second trace](https://github.com/vbalashi/2000nl/issues/421#issuecomment-5794169120) | `get_next_card` | 5,108 ms | upstream 5,061 ms | no error reported; status not retained |
| [Second trace](https://github.com/vbalashi/2000nl/issues/421#issuecomment-5794169120) | first `/api/platform/v2/lookup` | 4,799 ms | `lookup.exact-group` 3,575 ms | no error reported; status not retained |
| [Second trace](https://github.com/vbalashi/2000nl/issues/421#issuecomment-5794169120) | later lookups | 3,008 / 1,332 ms | `lookup.exact-group` 2,114 / 960 ms | no error reported; status not retained |

The HTML response was ~155 ms and bootstrap reads were ~100–320 ms each in the
first trace. The two first RPCs start in parallel; the slower selection path is
followed by a serial lookup. Those are separate pipeline stages and must not be
merged into the #413 session-plan diagnosis.

## Harness correction

`session_plan_latency.integration.test.mjs` previously diffed
`pg_stat_user_functions` using only schema and function name, which merged
overloaded functions. The diagnostic now emits each function OID and full
argument-type signature, computes deltas by OID, and fails on missing/invalid
identities, backwards counters, or changed signatures. It requires the exact
public six-argument wrapper plus `training_scheduler_candidates_v2` for the
six-argument path, and the exact eight-argument wrapper plus
`training_session_members_v1` and `training_scheduler_candidates_v2` for the
UI path. The two overloads are measured in separate transactions and checked
independently.

Validation on a disposable local Supabase database:

```sh
node --test db/scripts/session_plan_function_stats.test.mjs \
  db/scripts/scheduler_readiness_diagnostic.test.mjs
SESSION_PLAN_BENCHMARK_BASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  node --test db/scripts/session_plan_function_stats.test.mjs \
  db/scripts/session_plan_latency.integration.test.mjs
```

Results: 9 focused diagnostic unit tests passed. The disposable integration
test passed with 18,184 synthetic entries / 4,031 NT2 entries. The baseline
public path measured 95.268 / 89.803 / 86.127 ms; nested timing measured
**88.398 ms** for the 6-arg overload and **90.614 ms** for the 8-arg overload.
Both reports contained the expected OIDs/signatures and wrapper/helper call
counts. This validates identity accounting and the local fixture only; it does
not establish production equivalence or exclude production SQL.

Final rerun after the report correction also passed: 9 focused tests and 5
disposable integration tests. That integration run measured **88.250 / 88.418 /
89.911 ms** for the public baseline, **84.063 ms** for nested timing on the
6-arg path, and **89.471 ms** for the 8-arg path. Both overloads again reported
their own OID/signature and required helper calls.

After the redaction regression was added, the focused unit suite passed **11/11**
(`scheduler_readiness_diagnostic.test.mjs` plus
`session_plan_function_stats.test.mjs`). The disposable session-plan integration
was rerun and passed **5/5** with 18,184 synthetic entries / 4,031 NT2 entries;
baseline execution was **95.454 / 108.433 / 88.634 ms**, with nested timing at
**107.149 ms** (6-arg) and **112.870 ms** (8-arg). Both calls again reported the
expected OID/signature and wrapper/helper counts. This run is local fixture
validation only.

GitHub checks for commit `158e852f` passed: Database Drift Check and Production
dependency security. A follow-up documentation-only commit is pending its own
CI run.

## Acceptance checklist for #440

### Harness-test coverage audit

- [x] Redaction regression: `scheduler_readiness_diagnostic.test.mjs` verifies
  database URLs, named secrets, and long opaque tokens are removed from
  diagnostic output (`diagnostic output redacts database URLs, named secrets,
  and opaque tokens`).
- [x] Failure and timeout coverage: the isolated
  `session_plan_latency.integration.test.mjs` injects a 2.1-second delay and
  verifies the 2-second statement timeout fails the probe; malformed/missing
  EXPLAIN fields fail closed in `scheduler_readiness_diagnostic.test.mjs`. The
  timeout case uses a disposable local database; parser tests are unit tests.
- [x] Timing-boundary parsing: `scheduler_readiness_diagnostic.test.mjs` checks
  `Execution Time`, `Planning Time`, and outer-overhead calculation; the SQL
  integration harness records `Execution Time` separately from client wall
  time.
- [ ] Actual identity equivalence: no test establishes that direct SQL uses the
  same authenticated PostgREST principal, `authenticated` role/RLS, inputs, and
  data scope. The readiness SQL sets the JWT subject claim but does not `SET
  ROLE authenticated`; this remains blocked with the matched production-path
  criterion below.

- [x] Corrected the NUC `/proc` attribution in the canonical #413 report;
  production SQL/data-shape and Supabase resource pressure remain live hypotheses.
- [x] Recorded verified UI deployment and PostgREST connection paths from
  configuration/code. The project reference only identifies its API endpoint.
- [x] Verified Supabase compute tier/primary DB region: shared `t4g.nano`, West
  EU (`eu-west-1`); compute scaling is disabled on the Free plan.
- [ ] Verified NUC geographic location — still undocumented in the repository.
- [ ] Obtained time-correlated CPU/memory/disk/connection metrics for the
  managed database during slow requests. Dashboard snapshot and aggregate query
  statistics are recorded, but are not correlated to #413/#421 request times.
- [ ] Matched direct SQL / transaction-pooler calls to actual PostgREST calls
  using the same QA principal, role/RLS, inputs, and data scope — not complete.
  Existing #421 HTTP traces have no matched SQL baseline; #413 SQL calls do not
  measure its PostgREST UI request and do not switch to `authenticated` role.
- [x] Separated PostgreSQL execution from outer client time where available;
  recorded that the outer interval includes fresh container/client startup and
  is not pure pooler time. Full HTTP/app totals are available only for #421.
- [x] Stayed within the production limits by running no new production probe;
  did not repeat known first-slow/fast samples. Prior evidence is summarized
  with single-sample maxima and no p95 claim.
- [x] Changed local nested stats identity to OID/signature, added required-call
  assertions, and tested 6- and 8-argument paths independently.
- [ ] Full acceptance unmet: no matched request identity/sample IDs, exact
  timings/status codes/errors for an #413 HTTP-vs-SQL round, or per-request
  Supabase metrics. Current capacity and Query Performance data are aggregate
  observations, not matched to the existing traces. A new probe is useful only
  when dashboard metrics and an authenticated HTTP path can be correlated in
  one scheduled, read-only window.
- [ ] No production-cause conclusion for either issue. #413 supports neither a
  SQL rewrite nor a dedicated-node decision yet. #421 confirms an expensive
  server-side first-card pipeline but does not identify whether its DB, API, or
  resource layer dominates.

Next discriminating step: use the verified dashboard access to capture
time-correlated metrics while scheduling one <=3-call round with the same QA
principal/inputs via role-equivalent SQL and the actual PostgREST path. Record
per-request timestamps and backend identity and compare cloud metrics over that
exact interval. Do not use NUC telemetry as a database-resource proxy or repeat
another identical cold-first run.
