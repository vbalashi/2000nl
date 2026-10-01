# Training reliability: staged plan

Baseline: production 0.18.1063; evidence in diagnostics/2026-10-01-training-followup.

1. State consistency. Repeated Learn uses a revision previously changed by the same run. Deterministic cache/action regression, accepted-mutation invalidation and late-response probes, fix, rerun. Keep server concurrency guard.
2. Session lifecycle. Completed session offers disabled Continue. Reproduce through actual controller, distinguish terminal from paused/error/unavailable, repair home action. Shares restart trigger with group 1, but has a separate cause.
3. Server latency. Plan timeout and simultaneous slow actions/lookups/stats. Isolate exact scope, read-only plans and wait events. Fix proven bottlenecks only; retain unresolved resource evidence. Fast 409 and disabled button are not explained by slow SQL.
4. Presentation retirement remains separate maintenance; inventory ready.

Each stage records reproduction, falsifiable hypotheses, one-variable probes, exclusions, correction or unresolved question, and validation limits. Tested changes must be reviewable before rollout. DB manifest holds must not be bypassed.

## Stage 1: state consistency — fixed locally

Red command: `cd apps/ui && npx vitest run tests/platformV2TrainingClient.test.ts -t 'accepted action prevents reuse'`. Result before fix: expected Promise to be null, 9 ms. This minimizes the observed accepted Learn → later stale lookup chain at the real action/cache seam.

Hypotheses: cached old revision survives acceptance; a late in-flight lookup republishes it; server state is wrong. The first two are demonstrated by regression scenarios. Production's accepted new revision followed by an old submitted revision excludes weakening the server guard.

Accepted ordinary actions now notify the preparation cache, which invalidates every direction/language of the changed entry. Unrelated entries and media remain prepared. Late responses of cancelled preparations cannot return old state. A cancelled action-window refresh resolves unusable rather than leaving an unhandled rejection. The same common action boundary covers Library and reconciled acceptance.

Validation: 40 client tests, 44 turn-controller tests, 65 SenseCard component tests, one actual action-boundary test and 19 route tests pass; typecheck passes. No server revision policy, idempotency or FSRS change. The entire irregular production scenario has NOT been rerun against deployed repaired code; production still runs the previous release. Other tabs/devices can still legitimately cause guarded state conflicts.

## Stage 2: terminal session action — fixed locally

Actual controller/browser regression went red after accepting the card and returning home: Start missing, disabled Continue present. It passes after excluding exhausted ordinary sessions from the home resume projection. Does not clear historical learning or match sessions to presets by name. Supports ordinary meaning and word-in-context; idiom/sentence terminal home behavior has not been changed by this fix.

Acceptance: new run starts directly after confirmed exhaustion; paused run continues with only one session-start request. Both browser tests pass with dev test-login and with isolated mocked auth. The 43 existing setup tests pass. CI now runs the two approved-presentation regressions explicitly.

## Stage 3: SQL latency — investigated, unresolved

Correction: previous follow-up DO timeout bounded the entire repeated-probe statement, not a single plan. Report corrected; subsequent isolated single plan also timed out at 8s.

Ranked probes: candidate SQL work/global scope; generic/custom plan; JIT; transient resource contention. Same plan later took 1919 and 518 ms; JIT-off took 4765 ms. Warm candidate default/custom/default/JIT-off took 743/277/255/248 ms. This does not isolate a JIT/custom-plan benefit, so no server setting or migration was changed.

Scope limitation: SQL used the QA account’s persisted active collection, not a captured exact browser request. It must not be presented as an identical-scope replay of the VanDale browser runs.

Detailed expanded candidate plan retained: 2382 candidates; materializes all 18203 active bindings and 16985 definition nodes, reads the 4031-member collection scope, and spills 316 temporary blocks. Warm measured public plan's temporary I/O totaled only 4.6 ms and physical shared reads were zero. Those spills are not the dominant cause in that measurement. Expanded SQL and cached function calls are not interchangeable timing baselines.

Remaining: CPU/wait-event/concurrent workload samples at the same time as a slow request, internal function/JIT timings, exact browser scope and user-access conditions, impact of simultaneous stats and study-time calls. No direct link from the client state defects to SQL spikes is proven. No infrastructure sizing conclusion is warranted.

## Next pass

### Continuity checkpoint, 2026-10-01

New user observations are separate open investigations: #519 periodic blinking, #520 apparent immediate repeated card. Ordinary Training idle test retains its card across two real authority polls; six accepted finite actions target six distinct entry/direction pairs under delayed mocked selection/projection. Actual in-app Library captured development Fast Refresh, followed by a 97-second network-quiet window. None proves the reported symptoms fixed. Details and limits: `../discovery/2026-10-01-card-continuity-next-pass.md`.

Prior #440/#413 evidence was reviewed, avoiding duplicate timing work. Managed-host telemetry and exact equivalent browser/SQL scope remain missing. These issues were linked to the shared roadmap; no runtime or production change for the new symptoms.

Review and deploy the two verified client corrections separately from scheduler optimization, then repeat the original QA trace and collect matched server wait/CPU evidence during slow requests. If slow intervals recur, investigate the expensive candidate/source-group work with parity fixtures before changing SQL. Presentation retirement stays a separate maintenance change.

Evidence: `../diagnostics/2026-10-01-training-reliability/README.md`. No temporary debug logging remains. No production rollout in this pass.
