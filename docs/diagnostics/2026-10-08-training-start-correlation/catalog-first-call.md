# Collection catalog: bounded first-call diagnosis

Date: 2026-10-08. Issue: https://github.com/vbalashi/2000nl/issues/413
Measured product revision: `94039290c03b0d41b9d3b309d7fedc205522f200` (0.18.1199).

## Decision

Three diagnostic iterations completed. No production SQL or UI change is justified yet. A slow initial curated-catalog call is reproducible intermittently inside Postgres, but its cause is not identified. Ordinary warm execution is fast. Do not present this checkpoint as a speed improvement or close #413.

This catalog path is distinct from the historical session-plan timeout in #413. It precedes an enabled Training Start button; it is not loading all words after selecting a collection.

## Evidence and iterations

| Iteration | Probe | Result | Interpretation |
| --- | --- | --- | --- |
| 1 | Actual authenticated RPC, outer EXPLAIN and observer bound to its exact PID | First 2571.595 ms; repeat 78.833 ms | Slow sample captured on the same backend; shared hits only, no reported reads/temp I/O, JIT off |
| 2 | Actual RPC, transaction-local generic/custom plan modes | Generic 64.429/48.866 ms; custom 52.935/53.259 ms | No substantial win shown; these warm measurements cannot clear first-use planning |
| 3 | Extracted SQL body, prepared with language/list-type parameters | Planning 1.208–1.986 ms; execution 57.594–58.417 ms | Warm nested query is fast; not a profile of slow PL/pgSQL first use |

Earlier samples: 4258.04 ms followed by 50.34 ms; another outer EXPLAIN captured 3132.533 ms followed by 49.996 ms. Personal-list reads were 1.56–3.38 ms in the initial sequence.

The iteration-1 PID observer first saw intentional `PgSleep` during its attachment window, then active execution with empty wait events at sampled instants. The intentional one-second sleep is outside EXPLAIN execution time. Empty sampled wait events do not measure CPU consumption and do not exclude brief waits or operating-system scheduling. The first earlier application-name observer returned zero rows and is not evidence of absent waits.

The warm extracted query scans word_entries three times for three curated collections (18224 rows per scan). This is a potential optimization opportunity, not evidence that it causes the multi-second spike. Its execution role mirrors privileged SECURITY DEFINER data access and carries QA auth claims, but manual extraction does not reproduce the exact PL/pgSQL cached-plan lifecycle. Outer Planning Time excludes nested planning.

## Safe measurement boundary

All actual RPC probes used the isolated QA identity, matching auth claims, authenticated role, Dutch language and curated list type. SQL was inside READ ONLY transactions with a 10-second statement timeout, rolled back. No Training Starts, grades, collection writes, schema changes, global setting changes, cache flushes or backend termination. Observers were stopped. No browser timing was run alongside SQL probes. Session-pooler reuse was recorded; opening a new client is not proof of a fresh physical backend.

The 1000 ms diagnostic threshold is a triage signal, not a newly agreed product SLA. Initial count(*) output measured one JSON result rather than collection count; subsequent probes use jsonb_array_length. Timing evidence from the initial probe remains valid.

## Next useful step and stopping condition

Capture nested statement planning/execution on an actually slow first-use backend, with managed database resource measurements aligned to that interval. First check whether existing server profiling/log facilities can expose this safely. Do not install extensions or change production logging globally without a reviewed operational plan. Without such evidence, stop short of a speculative migration or compute upgrade. A candidate fix must both preserve catalog access/count/ownership semantics and improve repeated slow-path measurements; warm-only wins are insufficient.

Private replay scripts, plans and exact-PID wait samples are preserved at:
`/Users/khrustal/dev/2000nl/.worktrees/.reference-sync-backup-2026-10-08/622-release-measurement/`
under `catalog-goal/` and `catalog-diagnosis.md`. They contain no tokens, request bodies or dictionary content. No unrestricted raw trace is published.

## Second bounded goal: connection and initialization controls

Three series completed without product/production changes:

1. Read-only profiling capability inspection: auto_explain is preloaded, threshold 10000 ms, nested statements off, analyze off; track_functions=none, track_io_timing=off, pg_stat_statements.track=top. No configured profiling captures the 1.5–4.3 second nested path. This is a capability finding, not a cause. No extension/logging setting was changed.
2. Three sequential probes with distinct session-pooler backends, holding prior completed clients idle so the next client cannot reuse their backend. Only one catalog query executes at a time; an exact-PID observer samples separately. First/repeat curated times: PID3552264 1501.178/50.626 ms; PID3552265 64.614/50.772 ms; PID3552266 73.525/51.744 ms. These PIDs had newly observed backend_start timestamps. A new backend is not sufficient to cause a slow call. The slow sample again reports cached blocks/JIT off; sampled active waits are empty, not proof of CPU saturation.
3. Personal-catalog-before-curated control across three distinct backends: personal 26.188–30.427 ms; first curated 51.111–55.294 ms; repeat curated 48.646–52.296 ms. IMPORTANT: these are exactly the SAME three backend PIDs already exercised in series2. They are warmed controls, not evidence that a personal-list preflight fixes first-use latency. Do not add a speculative warm-up request.

Clients closed normally, observers stopped, all transactions rolled back. Deliberate one-second observer-attachment sleeps remain outside EXPLAIN measured durations. Session pooler port5432 tests are not an exact reproduction of REST/pooler routing, and backend first-use does not imply cold shared database cache. No owner/user browser was touched.

Decision unchanged: there is no verified targeted fix. Stop blind repetitions and prioritize a scoped server-side profile of a slow nested call. Existing auto_explain could potentially support a session-specific diagnostic, but availability of its sanitized log output and approved logging/redaction boundary must be established first. A global logging rollout or compute upgrade is not warranted by these samples.

## Third bounded goal: actual nested execution profiles

Safe scoped profiling was available and three profile captures completed. Only transaction-local auto_explain settings were used. Existing log_min_messages=warning was checked before capture; DEBUG5 plan messages were delivered to the private client capture, below the inspected server log severity threshold. No global logging configuration changed. Parameter logging disabled; UUIDs and QA email redacted in memory before writing artifacts. Read-only transaction and 10-second timeout retained; all settings rolled back.

| Profile | Instrumentation | Outer first/repeat ms | Nested catalog first/repeat ms |
| --- | --- | --- | --- |
| 1 | Nested analyze/buffers, per-node timing OFF | 3284.461 / 52.954 | 3261.785 / 50.964 |
| 2 | Nested analyze/buffers, per-node timing ON | 60.455 / 58.257 | 58.578 / 56.452 |
| 3 | Session-pooler, nested analyze/buffers, per-node timing ON | 79.269 / 59.145 | 67.008 / 57.194 |

Slow profile1 places almost all elapsed time in execution of the main nested catalog SQL, not entirely in outer function setup or nested query planning. Authentication expression and dictionary-row helper queries each measured 0.012–0.028 ms for its first call. Main slow plan has shared hits only, no reported disk/temp reads. Instrumentation can affect absolute timings; this does not establish precise uninstrumented overhead or managed CPU pressure. Nested durations are inclusive and must not be summed.

Profiles2/3 expose per-node times but are warm/fast. They show the same three dictionary-entry scans; they do not identify the node responsible for profile1 because per-node timing was disabled there. A slow TIMING ON profile is still required before selecting a node-specific fix. Scope has narrowed from general first-use hypotheses to the actual nested catalog executor interval.

Reproduction instructions and parameter semantics are based on PostgreSQL17 auto_explain documentation: https://www.postgresql.org/docs/17/auto-explain.html . Per-node timing has overhead; keep profiling bounded to isolated QA read calls. Private scripts and redacted captures: `622-release-measurement/catalog-profile-goal/`, `catalog-profile-timing-goal/`, `catalog-profile-session-goal/` in the recovery directory described above. The scripts are preserved as diagnostics, not a generic operational command to run on arbitrary users.

Next: at most a small bounded set of TIMING ON captures around naturally slow calls, aligned with managed resource measurements, or test a candidate query on an isolated representative local database with semantic parity. No speculative production SQL or global logging change has been made.

## Extended goal: historical trace reuse and query prototypes

Six bounded steps completed, without runtime/schema/deployment changes:

1. Reviewed the historical matched slow/warm traces in `docs/diagnostics/issue-413-session-plan-latency.md` (2026-09-24, matched inner plan and I/O timing sections). That investigation already found fast new backends, null sampled waits, tiny measured temporary I/O, and missing per-backend CPU/scheduling attribution. Its findings concern the scheduler and are not automatically a catalog diagnosis. Reused `summarizeAutoExplain` from `db/scripts/session_plan_inner_trace.mjs`; all three existing privacy/parser tests passed.
2. Scoped JSON nested profile with transaction-local function/I/O tracking and per-node timing captured an actual slow catalog call. Backend3552922: outer2745.569 ms, nested2723.702 ms; same-backend repeat59.816/57.667 ms. Nested shape hash `595aed40a7d0` matched between slow and repeat, root rows1; three collections and7150 membership rows per loop, same work shape. Seq Scan path averaged890.984 ms across3loops (about2673ms aggregate), versus11.681ms across3loops (~35ms aggregate) on repeat. All reported shared/local/temp I/O times zero; no shared reads. Function stats catalog first total2743.531/self2742.253ms, browse helper3calls totaling1.278ms. Loop node times are averages; ancestor totals overlap, do not add them. Node time is wall time, not measured CPU. Extra slow metadata/statistics plan189ms occurred after the first measured call and is not included in its2745ms duration.
3. PrototypeA groups collection/source memberships once. Read-only local fixture (50entries) returned exact JSON equality for nl/en/null scopes (6/2/10collections). This fixture is not representative for performance.
4. PrototypeA read-only QA comparison on production corpus returned exact JSON equality for nl/en/null (3/1/6collections) but regressed:60.939/60.672ms versus46.978/47.185ms baseline. Planner chose21449 separate word_entries index lookups,64539shared hits versus26364. Rejected; no migration.
5. PrototypeB first materializes only entry id/dictionary id, then groups counts. Exact JSON equality for the same three scopes locally and in read-only QA production queries. Baseline46.868/48.056ms; prototype39.730/40.416ms. Shared hits8917 versus26364; one dictionary-entry scan versus three. No reported temp spill. Saved diagnostic-only SQL beside this report, not an installed function or authorized replacement API.
6. Scoped prototype-first profiles:40.490/56.439/39.649ms and40.623/57.326/40.952ms for prototype/baseline/prototype. Both clients reused backend3553500; this is warm evidence, not independent cold validation. A slow prototype sample was not captured. These direct SQL prototype calls mirror SECURITY DEFINER table access under QA auth context, but bypass the public function wrapper; do not attribute the entire timing difference to the rewrite alone.

Decision: a concrete promising query prototype exists, with exact JSON parity on sampled scopes and lower warm buffer/work budget. It is NOT a validated fix for intermittent multi-second latency and is not release-ready. The execution excess was localized to the repeated dictionary-entry scan path, but CPU work versus managed scheduling remains unresolved, consistent with older scheduler traces. No evidence supports a compute upgrade or global setting change.

Before a release candidate: preserve the public identity/authorization guard, optional language/list-type contract (including combined user/curated output), ownership, unavailable-source counts and ordering; add representative parity cases for empty/mixed/inaccessible sources and materially larger collections on a disposable local database; compare matched first-use timings for the actual replacement function, not a warmed direct SQL query. Keep historical scheduler and catalog causes separate. The prototype remains a diagnostic artifact; no forward migration/checksum/manifest rollout is proposed yet.

Private summaries and SQL experiments are preserved under `622-release-measurement/catalog-expanded/` and `catalog-candidate2-profile/`. New nested profiles were parsed in memory and only allowlisted summary fields saved; raw SQL notices were not persisted. Existing parameter logging was disabled and all local profiling settings rolled back. No Training Starts, grading, collection modifications, backend termination or shared cache flushing.

## Complete-function isolated validation

See [catalog-validation.md](./catalog-validation.md) for60JSON comparisons,4denial and5access/count/ownership assertions on dedicated PostgreSQL17.6/17.11, expected-red auth test, lower ordinary runtime and backend CPU accounting. Multi-second managed tail not reproduced or declared fixed. Primary-local Supabase test caused a recovered backend crash; harness now forbids canonical54322. Canonical local contract220 versus app214 remains independently reported and was not reset. No production migration.
