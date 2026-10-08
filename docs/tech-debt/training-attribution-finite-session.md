# Finite-session attribution fixture / telemetry alignment

Recorded: 2026-10-08, during bounded #610 / draft PR #611 readiness work.
Owner boundary: UI test harness and training timing instrumentation; no scheduler or DB contract change is authorized by this note.

The opt-in `test:e2e:training-attribution` benchmark still fails. After its first accepted action, the real UI advances to word 2, but the fixture does not observe the matching `transition.start` and total timing event expected by the old scheduler-oriented benchmark. Bounded diagnostics recorded scheduler requests 0, finite-session requests 4 and projection requests 6. This distinguishes a missing telemetry contract from a hung card. It does not establish that the one-second performance budget is satisfied.

Reproduction uses the local QA wrapper on 3100, matching `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `APP_ROLLOUT_PROFILE=pilot`, and the opt-in benchmark script. Transport is mocked; this is not production or DB performance evidence. Diagnostic log/capture: `/Users/khrustal/adhoc/2000nl-610-retirement-evidence/readiness-2026-10-08/` (manifest identifies the source checkpoint). The historical 120-second timeout and current bounded 15-second missing-event capture both fail; neither should be reported as green.

A separate follow-up should define the finite-session transition owner/event contract, align the fixture with that contract, and characterize accepted-action identity, distinct next target, matched transition timing and failure diagnostics. Keep the existing one-second budget; validate desktop/mobile benchmark behavior without skipping, suppressing events or relaxing deadlines. Expand product instrumentation only after confirming whether the missing event is a harness expectation or a supported observability gap.

This remains optional benchmark debt outside normal browser smoke. #610 does not include a scheduler/controller decomposition to resolve it.

## Follow-up resolution under #612 (2026-10-08)

The failure above is a historical #610 checkpoint. Source `cb85bad6` allocates diagnostic transition identity before immediate accepted-action awaits and carries it through warm/fallback presentation; terminal, cancellation and failure close separately. The old fixture exercised an unrelated scheduler route; it now drives owned finite-session lifecycle scenarios and requires20 distinct ready cards plus one terminal per desktop/mobile profile. Its obsolete three-way bootstrap assertion is replaced by the account-language dependency approved in #273: preferences before scope, actual NL/EN scope language, then overlapping scope/scenario reads. No product bootstrap order, learning request payload or idempotency semantics change.

Root normal benchmark passes on that exact application/test source with all hit/miss/cancel/fallback checks and unchanged1000ms budget. A controlled actual>1s transition produces red; expected-red verification passes with causal attribution. Root122 focused cases, typecheck/lint and independent review pass. Submitted-head CI is tracked in the [#612 plan](../exec-plans/active/issue-612-state-ownership.md). The benchmark remains opt-in; mocked timing is not production performance acceptance, and the independent server latency issue #413 remains open.
