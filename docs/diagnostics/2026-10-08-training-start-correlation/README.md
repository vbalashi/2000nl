# Training Start correlation checkpoint — 2026-10-08

Issue: #413. Diagnostic source ref: `f2f15a84bfd125528f13eb4fbbeb48dc3a6df420`.
Production application: `0.18.1195`, `049d5cccbe938aeea465f58ac35adb05cc121704`, DB214.
The intervening #619 changes documentation only; application and DB code diff is empty.
Workflow: https://github.com/vbalashi/2000nl/actions/runs/37776918628

## Current observation

The existing bounded read-only diagnostic ran two samples per component, with
`ui-public` first, JIT off, statement timeout10,000ms unchanged. Every query
was in `BEGIN READ ONLY` and used the dedicated QA identity; no Training session
was started and no learning action was submitted.

| Component | First execution, ms | Repeat execution, ms |
| --- | ---: | ---: |
| UI eight-argument plan | 5382.670 | 820.710 |
| Legacy six-argument plan | 332.090 | 326.503 |
| Next-card helper | 307.978 | 301.035 |
| Filtered-card helper | 284.809 | 288.935 |
| Aggregate | 296.966 | 298.243 |

See readiness-samples.json for all12 observations, including candidate results.
The first UI plan exceeded the existing2,000ms performance warning budget;
the10,000ms diagnostic safety timeout was not exceeded. Workflow success means
completion, not proof that the2s performance target passed. No release limit
has changed, and this was not an exact pre-switch gate replay.

The first UI execution and repeat used the same physical backend3541172,
reported backend start12:27:04.336473Z, PostgreSQL17.6, work_mem2184kB and JIT off.
The first call followed that recorded backend start shortly, so backend-local
first-use cost remains a testable hypothesis. A fresh client alone is not proof
of a fresh database backend; this observation includes backend identity.

Shared block reads were0; first UI shared hits23656 versus20172 on repeat;
both had632 temp reads and316 temp writes. Outer planning was0.109/0.140ms.
Outer elapsed6930.762/2211.282ms includes Docker/psql setup, connection, wrapper
and transfer costs. The1548.092/1390.572ms outer overhead must not be
attributed to SQL or presented as browser/API latency (exact values in JSON).

Sampled active session-plan queries exposed no wait event. This does not rule
out waits between samples or DB CPU scheduling. Host sampler metrics describe
the NUC runner, **not the managed Supabase database host**. Host observed_at and
DB queryStart timestamps also differ in clock origin; do not claim subsecond
synchronization or infer Supabase CPU/RAM health from NUC metrics.

## Startup attribution gap

The existing train.mjs harness measures Start click to first ready card and
captures finished request paths, timings and available response metadata. Its
ordinary Start calls start_training_session directly through PostgREST.

- useTrainingPilotController persists active scope before the Start RPC.
- The RPC p_request_id is an idempotency key, not HTTP X-Request-Id.
- Ordinary Start has no shared transition ID tying scope persistence, session
  creation, first selection, lookup and the first ready card together.
- First-card selection creates a separate transition ID. Answer attribution
  e2e begins its measured window after Start and does not characterize startup.
- Next-route Server-Timing does not decompose direct PostgREST SQL execution.

Therefore a slow plan is now reproduced on current DB code, but this sample
**does not show that it blocked a real Start or identify its complete cause**.
Do not change scheduler SQL, compute size, session semantics or budgets based
on this sample alone.

## Next bounded experiment

One production QA Start-to-first-card capture, zero answers/grades:
`bash scripts/latency-audit/run.sh train.mjs 0 0 desktop-start-413`.
This creates or continues a QA session and is pending explicit owner approval
under docs/runbooks/production-latency-measurement.md. It mints and revokes the
QA login via run.sh. Do not run SQL probes concurrently. No owner browser
session is touched. A stale selector/harness must be repaired and locally
validated rather than clicking unrelated controls or submitting answers.

Correlate request order/interval and available Server-Timing to the first-ready
boundary. Separate active-scope persistence, Start RPC, next selection and
lookup/render. Request paths/intervals can support client attribution; they
cannot identify an internal SQL span without separate DB-side evidence.

If the capture confirms the gap, implement a dedicated startup telemetry owner
with a new transition ID independent of the idempotency key; characterize
failure/cancellation and first-ready completion before splitting controllers.
Only after a reproducible matched trace should a narrow SQL/runtime experiment
be selected. Existing selection, privacy and release guardrails remain intact.

Validation: six scheduler diagnostic/activity sampler tests pass. Raw bounded
aggregate evidence is in read-only-probe.txt; no request bodies, tokens, card
content or learner identities are included.
