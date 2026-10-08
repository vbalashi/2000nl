# #612: finite-session telemetry and state ownership

Owner-approved bounded follow-up to merged #611; base6ff4cfdad3496d8a1b331a7efe1d6f0d91ca0f76. Worktree612-telemetry-owner. UI/test owning layer; server scheduling and mutation authority unchanged.

## Completion boundary

Three sequential review-ready slices, each characterized before extraction and independently reviewed:
- [ ] Telemetry: reproduce missing event, define accepted-action→distinct next-card/terminal transition identity; preserve failure/cancellation semantics, bounded redaction and1s desktop/mobile budget. Validate pure/component timing plus opt-in browser benchmark and injected-delay failure.
- [ ] Library: one search lifecycle owner for scope/freshness/request generation/filter Apply/cursor pages; preserve transport, errors and selection behavior. Test repeated Apply, out-of-order responses, scope change, page resets and unmount.
- [ ] Training: extract resume/reconciliation decisions; preserve one coordinator, session authority, accepted progress, request generations, supersession and offline/error behavior. Characterize revisions and stale responses before moving code.
- [ ] Relevant integration checks, docs and independent review; attach review-ready PRs with exact evidence.

No UI redesign, SQL/DB/API contract changes, scheduler policy or learning mutations. No merge/deploy without further owner approval. #413 diagnosis is context only, not an additional optimization target. Stop after these slices.

## First checkpoint

Root baseline opt-in benchmark on unchanged merged application source/canonical3100 fails at first accepted-action timing wait while UI advances. Evidence `/tmp/612-telemetry-baseline.log` and Playwright stalled-transition attachment. This establishes a red reproduction; no deadline or budget changes. Independent agents inspect timing identity and propose Library/Training seams; those extractions remain pending until telemetry is accepted.

## Accepted internal designs

Telemetry: the historical selection-ready barrier accepts pre-close events. More importantly, a real immediate post-resume action can run without a speculative nextTransitionId. Allocate the action transition before awaits and carry it through the mutation and actual next presentation, including warm and fallback paths. Close terminal/rejection/cancellation outcomes once; terminal completion is never a substitute for a distinct-next-card ready sample. Existing action idempotency and payloads remain unchanged.

Library: one applied-search lifecycle hook replaces the existing group hook plus top-level freshness/pending/debounce ownership. Preserve the parent-owned DictionarySearchTabState snapshots, cursor lifetime and reopen/preload behavior through a compatibility adapter; do not turn persisted result state into hook-local state. Existing dictionary/list transports remain. Material/catalog readiness, draft filter preview, detail hydration and selection remain outside. Add characterization of in-flight identical Apply, stale collection results, mode switching and deactivation; avoid adding speculative new canonicalization behavior.

Training: pure preflight/snapshot/reconciliation decisions receive values and return bounded outcomes. TrainingScreen remains sole executor of fetches, refs, setters, timers, family-specific restore and side-effect order. Preserve generation/session fences, replan promise coalescing, accepted counters and existing error codes. Characterize pending language/list hydration and accepted-progress preservation before extraction. No second controller.

## Timing source checkpoint

`12af241c` passes root120 focused timing/controller/card tests and independent source review. The first browser candidate completes20 distinct next-card transitions plus one terminal per desktop/mobile profile; old fixture lifecycle injection still targeted the unrelated scheduler route. `2fbb457f` routes controlled cancel/fallback through the owned-session selector, preserving coverage requirements and finite progression; both profiles then exercise hit/miss/cancel/fallback and remain under1s in mocked QA. Exact final-head browser verification still follows.

The benchmark's former three-way bootstrap-overlap assertion conflicts with approved #273 (`85ac1708`, already an ancestor of6ff4cfda): HomePage waits for authoritative account language before mounting TrainingScreen, and active-scope hydration depends on that language. The earlier overlap used speculative default-language reads. Relevant startup files are unchanged by #612. Replace that obsolete assertion with stricter actual dependency checks (preferences resolve before scope read, correct account language, scope/scenarios concurrency after mount), preserve the raw overlap metric as false, and keep1s transition budgets. No product startup sequencing change. A nominal injected delay can partly occur off the critical path; validate the detector with an actual measured>1s interval rather than asserting nominal delay equals user wait.
