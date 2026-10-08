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
