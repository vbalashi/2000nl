# Finite-session attribution fixture / telemetry alignment

Recorded: 2026-10-08, during bounded #610 / draft PR #611 readiness work.
Owner boundary: UI test harness and training timing instrumentation; no scheduler or DB contract change is authorized by this note.

The opt-in `test:e2e:training-attribution` benchmark still fails. After its first accepted action, the real UI advances to word 2, but the fixture does not observe the matching `transition.start` and total timing event expected by the old scheduler-oriented benchmark. Bounded diagnostics recorded scheduler requests 0, finite-session requests 4 and projection requests 6. This distinguishes a missing telemetry contract from a hung card. It does not establish that the one-second performance budget is satisfied.

Reproduction uses the local QA wrapper on 3100, matching `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `APP_ROLLOUT_PROFILE=pilot`, and the opt-in benchmark script. Transport is mocked; this is not production or DB performance evidence. Diagnostic log/capture: `/Users/khrustal/adhoc/2000nl-610-retirement-evidence/readiness-2026-10-08/` (manifest identifies the source checkpoint). The historical 120-second timeout and current bounded 15-second missing-event capture both fail; neither should be reported as green.

A separate follow-up should define the finite-session transition owner/event contract, align the fixture with that contract, and characterize accepted-action identity, distinct next target, matched transition timing and failure diagnostics. Keep the existing one-second budget; validate desktop/mobile benchmark behavior without skipping, suppressing events or relaxing deadlines. Expand product instrumentation only after confirming whether the missing event is a harness expectation or a supported observability gap.

This remains optional benchmark debt outside normal browser smoke. #610 does not include a scheduler/controller decomposition to resolve it.
