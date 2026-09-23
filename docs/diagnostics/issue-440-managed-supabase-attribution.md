# Issue 440: managed Supabase and Training latency attribution

Date: 2026-09-23; follow-up evidence added 2026-09-24. Scope: bounded,
read-only evidence review; no runtime change, production request, deployment,
or database setting change in this issue branch.

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
release, plus one supplementary cold root-page trace, show several seconds in
the Supabase upstream for training statistics and card selection, followed by
a slow Platform V2 lookup. In the supplementary root trace, LCP was 0.49 s;
notes place `Loading card` around +5 s and say the home UI returned later, but
they do not retain the exact app-ready time. The separate Network `Finish`
boundary at 17.57 s is not an app-ready measurement. The request path is
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
quota as material risks and checking storage usage. A later ten-minute resource
chart overlaps one #421 trace (details below): it shows low CPU and memory
commitment near the plotted limit, but no per-request resource sample. This
does not establish that memory pressure caused the latency. No compute change
is justified on these observations. The app/NUC geographic region remains
unknown.

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
35861721662, 35864272860, or the #421 HTTP traces. At the time of this initial
snapshot, the CLI was not authenticated; the owner used
the existing authorized Chrome profile for the dashboard review. CLI access was
subsequently authorized through that same profile, and `supabase projects list`
now succeeds. No CLI database inspection was run, and no credential value or
production data was exposed in the report.

**Near-time resource dashboard review for run 35864272860 (2026-09-23).** The slow UI
overload began at `13:01:56.782319Z` on backend `2211863`. The Supabase
Observability → Database dashboard was set to `12:58Z–13:05Z`, a seven-minute
window containing that call and its warm repeats. The dashboard summary showed
CPU `0.41%`, memory used `411.32 MB`, memory commitment `1.21 GB`, and network
throughput `7.2 KB/s`. IOPS, disk
throughput, connections, and disk-usage panels did not load in that view. These
are coarse dashboard-window observations, not per-request measurements; the
headline values are not retained as exact samples at the slow query timestamp,
and the dashboard does not establish the maximum CPU or memory use during the
call. Do not treat `0.41%` as a time-correlated CPU measurement.

An earlier bounded Logs Explorer query for the diagnostic interval returned no
rows. A follow-up query against the unified logs stream found 3 auth, 41 edge,
3 PostgREST, and 2 PostgreSQL rows in the ten-minute window. In the exact
20-second browser trace window, edge/auth events were present, but there were
no PostgREST or PostgreSQL rows. The PostgREST and PostgreSQL rows elsewhere in
the ten-minute window do not align with the measured RPC timestamps. The
earlier empty result was therefore a limitation of that query/source selection,
not evidence that all Supabase services were idle. The available chart and
missing panels still cannot rule out short-lived or backend-local resource
pressure. This does not prove or exclude a managed-capacity cause and does not
justify a compute move or SQL rewrite.

**Access and data-target audit (2026-09-23).** The authorized Supabase CLI
(`2.101.0`) lists the active, healthy project `2000nl` with reference
`lliwdcpuuzjmxyzrjtoz` in `eu-west-1`. The repository's production QA policy
uses the same API origin; production deep health on release `0.18.696` reports
`status: ok` and `database.target: remote` with expected contract
`2000nl-db-156`. Health does not disclose the live project reference. A
read-only inspection of resource-host names already recorded in the existing
authenticated production Chrome tab found
`lliwdcpuuzjmxyzrjtoz.supabase.co`; no page reload or new production request
was made for this audit. This verifies the browser's observed API target,
though not the project/role used by each historical SQL or dashboard sample.
The same authorized Chrome profile was used for dashboard observations; an
unauthenticated browser was not used. The CLI is not linked to this project
and no CLI SQL inspection was run.

At follow-up, the Supabase MCP was callable. `get_project` explicitly selected
reference `lliwdcpuuzjmxyzrjtoz` and returned project `2000nl`, region
`eu-west-1`, status `ACTIVE_HEALTHY`, and PostgreSQL `17.6.1.054`. The bounded
historical `query_logs` reads below also targeted that exact project. No SQL
execution, request payload, auth header, user identifier, or learner content
was read or retained in this follow-up. The CLI remains unlinked to the
project; no production SQL inspection was run. Tool availability alone does
not establish equivalence between a database role or request path.

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

### Additional cold root-page trace (2026-09-23)

One cold reload of the authenticated production root page was recorded in the
existing Chrome profile without clicking any training controls. Chrome
Performance reported **LCP 0.49 s**, **CLS 0.00**, and Network `Finish` at
**17.57 s** across **88 requests / 13.2 MB**. The request count/bytes include
resources not yet attributed to the app (for example, extension or media
resources); do not use the total as an app transfer-size measurement. The page
showed `Loading card` around +5 s, then returned to the home UI later. The exact
app UI-ready timestamp was not captured; Network `Finish` is only the network
completion boundary.

| Request | Started after navigation | Total request duration | Queueing | Waiting for server | Body download |
|---|---:|---:|---:|---:|---:|
| first `get_next_card` | +2.32 s | not retained | ~17 ms | 5.50 s | <1 ms |
| `get_detailed_training_stats` (concurrent) | +2.32 s | not retained | not retained | 3.86 s | 41 ms |
| second `get_next_card` | +12.11 s | not retained | not retained | 2.45 s | not retained |
| `/api/platform/v2/lookup` | not retained | 4.29 s | not retained | not retained | not retained |
| `/api/platform/translation` | not retained | 4.14 s | not retained | not retained | not retained |

This single trace shows that server wait dominates the observed timing of the
first two RPCs and captures a later second `get_next_card` request. The lookup
and translation values are total request durations; their timing-phase
breakdown was not retained. The trace is not a percentile, and it is not
causally joined to the 24-hour dashboard aggregates. No HAR or full request
headers were retained because those contain auth data.

Source review finds one likely, but unconfirmed, explanation for the second
`get_next_card`: the initial-load effect in `TrainingScreen.tsx` calls
`loadNextWord()` once after list/resume gates pass
(`TrainingScreen.tsx:899-916`; `initialLoadDone` prevents that effect from
simply firing twice). Once `currentWord` exists, the effect in
`usePreparedNextTrainingTurn.ts:239-263` starts a separate next-candidate
selection and excludes the displayed card; the
`TrainingScreen.test.tsx:852-859` startup helper expects at least two selector
calls after the first card heading appears.
Language/mode and focus-filter changes can also replace selection after a real
scope change, although refs and hydration gates suppress an ordinary repeat
with unchanged defaults. Since the trace did not preserve the second request's
initiator or argument signature, its exact cause remains unknown; the request
is consistent with intended speculative next-card preparation, not proven to
be that call.

### Additional authenticated root-page trace in a new Chrome tab (2026-09-23)

One more navigation was captured in a separate tab in the same authorized
Chrome profile at `2026-09-23T17:44:53.595Z`. The browser profile already had
the production app open, so this is a new-tab navigation, not a cold browser or
cache experiment. No controls were clicked. The first observed UI state was
`Preparing training`; a later accessibility snapshot showed the Today `Quick
start` and `Continue session` controls. The precise time those controls first
became available was not captured. No answer/review or progress action was
performed.

The document returned quickly (`responseStart=109 ms`, DOMContentLoaded `164
ms`, load `214 ms`). Sanitized Resource Timing entries show:

| Request | Start after navigation | Duration | Server timing |
|---|---:|---:|---|
| `get_learning_preferences` | 738 ms | 709 ms | not exposed |
| setup/scope/bootstrap RPCs | 1,820–2,109 ms | 95–412 ms | not exposed |
| `get_detailed_training_stats` | 2,208 ms | 4,205 ms | not exposed |
| first `get_next_card` | 2,208 ms | 5,659 ms | not exposed |
| first `/api/platform/v2/lookup` | 7,872 ms | 5,042 ms | route 4,953 ms; auth 959 ms; operation 3,992 ms; exact-group 3,528 ms; user-state 336 ms; translations 461 ms |
| later `get_next_card` | 12,999 ms | 2,087 ms | not exposed |
| later `/api/platform/v2/lookup` calls | 15,091 / 15,708 ms | 3,213 / 2,664 ms | exact-group 2,440 / 2,316 ms |

This one root navigation confirms the same sequential selection → projection
path in the exact production tab: the first projection RPC begins immediately
after the first selection returns. It also shows a later selection and two
more projection requests. Since argument bodies and initiators were not
retained, their identities and purpose cannot be inferred. The SQL execution
time within the Supabase HTTP RPC is not exposed by these timings. Browser
Resource Timing has no useful cross-origin response-start detail for the
PostgREST calls; the same-origin application route does expose its server
timings. Treat this as one additional sample (not a percentile or a cold-start
result), with the user-visible ready transition still lacking an exact marker.

The Supabase Database Observability page was set to the overlapping
**17:40–17:50 UTC** window. It displayed memory used **411.32 MB**, memory
commitment **1.23 GB**, CPU **1.39%**, network **22.4 KB/s**, and **7 IOPS**.
The ten-minute commitment plot appears to stay near the displayed **1.24 GB**
commit-limit line; the CPU plot is mostly idle. The memory-usage chart also
shows a visible `Swap` segment throughout the plotted interval. This is swap
occupancy, not a measurement of page-in/page-out activity during the slow RPCs;
previously swapped pages may remain allocated after pressure subsides. Likewise,
memory commitment is promised virtual memory, not resident usage. Supabase's
documentation warns about sustained swap *activity* and high commitment
([Database Observability](https://supabase.com/docs/guides/observability/reports#memory-usage)).
These charts justify checking connections, query allocations, and swap I/O at
the same request times, but do not establish contemporaneous memory pressure or
causation. The screenshot did not expose an exact swap number.
Disk-throughput, connection, and disk-usage panels did not load; the separate
size card showed **0.48 GB / 8 GB**. Low CPU weakens sustained CPU saturation
for this interval.

**Sanitized Supabase edge-log correlation for the same browser trace
(read 2026-09-24).** A bounded unified-log query covered
`2026-09-23T17:44:50Z`–`17:45:10Z`, around the new-tab navigation at
`17:44:53.595Z` recorded above. The selected fields were timestamp, method,
route path, authenticated JWT role where present, HTTP status, gateway
`response.origin_time`, and cache status. User, session, IP, token, query-string,
request-body, and response-body fields were excluded.

| Supabase route | Started after navigation | JWT role | HTTP | Gateway `response.origin_time` |
|---|---:|---|---:|---:|
| `get_learning_preferences` | +0.844 s | authenticated | 200 | 606 ms |
| `user_settings` | +0.847 s | authenticated | 200 | 604 ms |
| Setup/scope RPCs (`get_training_filter_sources`, `get_available_learning_languages`, `get_training_scenarios`, `get_available_word_lists`, `get_active_training_scope`) | +1.86–1.88 s | authenticated | 200 | 166–369 ms |
| `get_word_list_summary` | +2.153 s | authenticated | 200 | 52 ms |
| `get_detailed_training_stats` | +2.251 s | authenticated | 200 | 4,169 ms |
| First `get_next_card` | +2.255 s | authenticated | 200 | 5,618 ms |
| `fetch_dictionary_entry_by_id_gated` | +12.992 s | authenticated | 200 | 186 ms |
| Later `get_next_card` | +13.023 s | authenticated | 200 | 2,069 ms |
| `read_platform_v2_training_group` (two calls) | +15.552 / +15.759 s | not exposed | 200 | 2,397 / 2,294 ms |

The first `get_detailed_training_stats` and `get_next_card` gateway timings are
within 36 ms and 41 ms, respectively, of the browser Resource Timing durations
in the same trace (4,205 ms and 5,659 ms). This strongly locates almost all of
those two waits inside the Supabase API/origin path rather than browser transfer
or rendering. It does **not** isolate PostgreSQL execution from PostgREST,
gateway, connection acquisition, or response serialization. All observed
requests returned HTTP 200; these two RPCs used the authenticated role. The two
`read_platform_v2_training_group` events are close in time to the later
Platform V2 lookups in the browser trace, but no shared request ID was retained,
so their exact pairing is not proven. They do not explain the first lookup.

This supplies the missing request timestamps/status and a Supabase-side
upstream-duration boundary for the #421 sample. It does not supply the
per-request host CPU, resident/free memory, active swap I/O, disk, or connection
metrics required to attribute the high origin times to managed compute. The
log records also do not expose a SQL execution duration for those exact RPCs.

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
- [x] Production sample count is capped at three per component in both the CLI
  and manual workflow; the default is three and invalid counts fail before DB
  access.
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
- [ ] Obtained per-request CPU/memory/disk/connection metrics for the managed
  database. A 10-minute resource chart overlaps one #421 root navigation and
  shows low CPU, memory commitment near the plotted limit, and visible swap
  occupancy. Neither chart measures swap I/O or resident pressure at the RPC
  seconds. Other resource panels failed to load, and #413 plus earlier #421
  traces remain unmatched.
- [ ] Matched direct SQL / transaction-pooler calls to actual PostgREST calls
  using the same QA principal, role/RLS, inputs, and data scope — not complete.
  Existing #421 HTTP traces have no matched SQL baseline; #413 SQL calls do not
  measure its PostgREST UI request and do not switch to `authenticated` role.
- [x] Separated PostgreSQL execution from outer client time where available;
  recorded that the outer interval includes fresh container/client startup and
  is not pure pooler time. Full HTTP/app totals are available only for #421.
- [x] Stayed within the production limits: one additional read-only root-page
  navigation captured missing stage/resource context; no learner action was
  performed. The diagnostic CLI and workflow cap SQL rounds at three samples
  per component. Prior evidence is summarized as samples, not percentiles.
- [x] Changed local nested stats identity to OID/signature, added required-call
  assertions, and tested 6- and 8-argument paths independently.
- [ ] Full acceptance unmet: #413 still lacks matched HTTP-vs-SQL request
  identities, equivalent authenticated-role SQL, and exact inputs/data scope.
  For #421, the edge-log follow-up now adds authenticated-role status codes and
  a gateway-origin timing that closely matches browser duration for the first
  stats/card RPCs, but it still lacks SQL execution time and per-request host
  CPU, resident/free memory, active swap I/O, disk, and connection metrics.
  Aggregate charts and Query Performance values are not substitutes for those
  matched observations.
- [ ] No production-cause conclusion for either issue. #413 supports neither a
  SQL rewrite nor a dedicated-node decision yet. #421 confirms an expensive
  server-side first-card pipeline but does not identify whether its DB, API, or
  resource layer dominates.

Next discriminating step: for #421, obtain a bounded same-window database
metrics sample (free/resident memory, active swap I/O, connections, CPU and
disk) around an already planned authenticated startup capture; do not repeat an
identical cold-first run just to recreate this log sample. Separately, for
#413, compare its actual PostgREST request with role/RLS-equivalent SQL for the
same principal, arguments, and data scope. The equivalent SQL path and a
reliable per-request metric export are not yet available in this task. Preserve
the existing sample caps; retain only sanitized request identity and timing
boundaries. Do not retain auth headers/HARs or use NUC telemetry as a
database-resource proxy.
