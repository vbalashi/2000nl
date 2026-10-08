# #612: finite-session telemetry and state ownership

Owner-approved bounded follow-up to merged #611; base6ff4cfdad3496d8a1b331a7efe1d6f0d91ca0f76. Worktree612-telemetry-owner. UI/test owning layer; server scheduling and mutation authority unchanged.

## Completion boundary

Three sequential review-ready slices, each characterized before extraction and independently reviewed:
- [x] Telemetry: reproduce missing event, define accepted-action→distinct next-card/terminal transition identity; preserve failure/cancellation semantics, bounded redaction and1s desktop/mobile budget. Validate pure/component timing plus opt-in browser benchmark and injected-delay failure.
- [x] Library: one search lifecycle owner for scope/freshness/request generation/filter Apply/cursor pages; preserve transport, errors and selection behavior. Test repeated Apply, out-of-order responses, scope change, page resets and unmount.
- [x] Training: extract resume/reconciliation decisions; preserve one coordinator, session authority, accepted progress, request generations, supersession and offline/error behavior. Characterize revisions and stale responses before moving code.
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

Final application/test source `cb85bad6`: root120 timing/controller/card cases plus2 report cases pass, root typecheck/lint pass (one existing hook warning). Independent review accepts source and fixture. Exact pinned temporary QA3101 (owner-review3100 preserved) passes the normal benchmark:20 ready+1terminal per profile, all lifecycle coverage, NL/EN account-language checks; max101.8ms desktop/87.2ms mobile. Injected2500ms configured across fixture stages yields actual maxima1479.8/1473ms; normal green expectation correctly fails, and explicit expected-red mode passes with causal attribution and unchanged1000ms budget. These are mocked transport measurements, not production or #413 acceptance. Benchmark report dirty=true is solely the generated next-env.d.ts dev types path; relevant source hashes match the commit, generated file restored afterward. Temporary3101 stopped. Full submitted-head CI follows PR submission. Evidence `/Users/khrustal/adhoc/2000nl-612-state-ownership-evidence/telemetry/`.

## Broader review checkpoint

PR #613 first full unit CI:2063 passed,339 optional skipped,1 failed action-boundary test. Diagnosis: the old partial Response fixture lacks headers; newly correlated response timing throws on that fixture and the client takes its ambiguous-response reconciliation path. Actual spy calls are one action and one reconcile, not a duplicate action. Complete the fixture's real Response contract and retain all acceptance-lock assertions; rerun CI before accepting this slice.

Library candidate27ec3684 root31 grouping/lifecycle units, typecheck and lint pass. Exact pinned local QA passes19 browser cases (pagination820px,10 recovery repetitions, mobile sheet390/610, details320/430/1440 light/dark). Initial browser invocation used the fixture's default localhost Supabase storage key against wrapper127.0.0.1; corrected test environment passes. This is an environment mismatch, not product evidence. Temp3101 stopped and generated next-env restored. Independent review found an inherited debounce-window stale-response race and split cursor/page ownership; fix both with explicit tests before PR. Training pure-decision slice now underway on an independent6ff worktree.

## Review-ready Library/Training and final telemetry fixture check

Library#6141094c6a6 and Training#6152d04656c independently reviewed and now ready for review. Library CI37766549140:2063 units,180API,185 normal plus1 reflow retry,25pilot,17reliability passed. Training CI37766625021:2082 units,180API,185 normal plus1 report-focus retry,25pilot,17reliability passed.339 optional DB cases skipped as in baseline. Retries are recorded, no assertions/deadlines changed. Combined43d79009:2093 units,20 targeted browser cases, opt-in normal timing benchmark, types/lint pass;95.6/94ms mocked maximum desktop/mobile. Temp3101 stopped after integration; owner's3100 untouched. Durable evidence in /Users/khrustal/adhoc/2000nl-612-state-ownership-evidence/.

Telemetry full CI37766273714 exposed a deterministic composition-fixture interaction (184 normal cases pass,1 composition fails; one report-focus retry). A/B same application/spec with original6ff harness passes; the migrated lifecycle state machine conflicted with forced-on-demand readiness and falsely completed at2/50. Fix must keep acceptance readiness gating, mark the forced prefetch miss as awaiting authoritative fallback, and never treat an absent card as a successful distinct next-card transition. Six actual next cards / seven distinct displayed headwords and six distinct action IDs strengthen the composition test;500/300ms modeled delays,100ms in-flight preserved answer and>120ms median difference remain unchanged. No application change. Final exact integrated QA and submitted-head CI follow this narrow fixture correction.
