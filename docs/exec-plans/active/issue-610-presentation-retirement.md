# #610 — approved presentation retirement

Live lifecycle: https://github.com/vbalashi/2000nl/issues/610 (child of #255).
Decision: ../../discussions/2026-10-07-01-ui-retirement-and-refactor.md.

## Baseline and ownership

Base: 9aa380ea6fcaccd2ce7c0c478fa4465911c91158. Public production health on 2026-10-07 reported the same commit, release 0.18.1190, status ok, DB contract 214 and both presentation switches enabled. Reference main is stale and dirty; it is not the implementation checkout.

Root integrates in `.worktrees/610-presentation-retirement`. Separate navigation, Library, Training and browser-test worktrees prevent shared-index or file races. Luna handles inventory/navigation/Library/browser specs; Sol handles coupled Training state/presentation; root reviews domain ownership and test equivalence.

## Behavioral contract

The result must match the baseline with both presentation flags enabled. A feature visible only in the old branch is not automatically ported to the approved UI. Shared preference loading, session authority/resume/completion, late-response fencing, account material access, translation-off and mobile focus/scroll behavior remain supported. Public Platform flags/APIs, FSRS, applied migrations and provider normalization are outside this deletion.

## Reviewable sequence

1. Preserve approved-path characterization and capture baseline checks.
2. Retire old navigation/settings/statistics, Training, Library and article branches.
3. Remove the two flags from build/config/health/deployment and stop skipping approved browser tests.
4. Integrate, audit actual callers (including dev routes), remove newly orphaned code, add retirement guard and run combined checks.
5. Reassess remaining Setup/Library ownership after deletion. Keep domain extraction in a separate commit/slice with tests before movement; do not create a second session-state owner.
6. Independent review and exact-head evidence/PR. Review-ready is not integrated or deployed.

## Validation evidence

Baseline full Vitest on unchanged runtime/unit source at 9aa380ea: 235 files passed, 35 skipped; 2078 tests passed, 339 skipped. Skips include optional DB/integration suites; this is not DB validation.

Initial config/health change: 14 tests passed. Browser spec discovery after migration: 248 tests in 44 files. Integrated runtime execution is recorded below when completed.

Independent review and browser comparison caught and corrected four retirement mistakes: the no-chrome session still needs `FooterStats`; native Library/report dialogs must retain their own Escape handling rather than gain old document listeners; caller-requested Library overlay padding remains supported; opening collection creation must focus its name input. These are retained approved behaviors, not new UI features.

With identical mocked-font settings and both baseline presentation switches enabled, the 402px and 1024px approved session screenshots are byte-identical before/after retirement. This compares the deterministic test rendering, not production font delivery. The retirement guard also rejected a temporary retired-flag reference in active source and passed after the probe was removed.

Do not use the initial port-3102 run as approved-baseline evidence: its presentation flags were initially false. It was stopped and restarted with both explicitly true, verified through health. The prior owner-run port-3100 baseline became unavailable mid-run; connection failures are infrastructure failures, not app regressions. Browser assertions for retired Start/Back labels were migrated without changing their session recovery contracts.

### Review checkpoint

Runtime/browser checkpoint: `c2f1d69937aad1809276de891ee2c853f50957df` against baseline `9aa380ea6fcaccd2ce7c0c478fa4465911c91158`. The baseline checkout contains test-only follow-up commits; its application source is unchanged, with both presentation flags explicitly enabled.

- Full Vitest: **235 files passed; 2,055 tests passed, 339 skipped**. Optional DB suites were skipped, not validated. The integrated TrainingScreen suite includes 78 cases and numeric stale-stat/request-adoption characterizations on the supported no-chrome path.
- Production Next build passed using deterministic font mocks and a local placeholder public Supabase configuration. Existing route-config re-export warnings and the existing `handlePlayAudio` dependency warning remain.
- Final focused Playwright: **116 passed**, 27 specs, two workers, local DB contract 214. Includes navigation, palette/size combinations, Library reads/details, modal dismissal, session start/resume/completion, idle/focus continuity, owned-request recovery, pending stats, bootstrap and mobile containment. API fixtures make this UI contract coverage, not a live backend mutation or FSRS validation.
- The final server health reported the exact checkpoint above, local database and retained capability flags; the two retired presentation diagnostics were absent. Final 402px/1024px screenshots are byte-identical to the matched baseline.
- Retirement guard passed, including the negative probe described above. `git diff --check` passed. The style audit still reports the pre-existing debt documented below.

The historical browser suite is **not wholly green**. Exploratory broad runs were stopped after repeated obsolete-entry timeouts (current: 118 passed/53 failed; approved baseline: 125 passed/47 failed; each had 74 not run). Subsequent scoped migrations preserve and pass the relevant start/recovery scenarios. Do not present those interrupted runs as full-suite completion. Baseline reproduction also confirms outstanding headword/type measurements, reveal timing, report-success focus and short-viewport reflow failures; the 640×400 Large-spacing case measures the same 28px body before/after. The attribution benchmark reaches live training but exceeds its 120-second budget. The final focused run deliberately excludes the known report-success and two reveal-animation failures; no assertions or tests were disabled in the repository to obtain a green result.

Local retained evidence (logs, health, screenshot pairs and SHA-256 manifest): `/Users/khrustal/adhoc/2000nl-610-retirement-evidence/`. Temporary servers 3101/3102 were stopped. Worker checkouts and their committed branches are retained for review; no merge or deployment is part of this checkpoint.

## Follow-on architecture seams

- Setup: saved-training intent resolution and start-draft validation belong next to `lib/training/setups`, not a catch-all hook. Existing account setup/material hooks remain sole owners of persistence and availability.
- Library: grouped search already has `useLibraryHeadwordGroupSearch`. Any remaining list-search request key/cache/dedupe/page handling should be a narrow owner, distinct from entry editing and details.
- Training: snapshot/replan decisions may be extracted behind characterization, but generation refs, session identity and queue effects must remain under one coordinator. Do not split by file length alone.

These are design directions pending post-deletion assessment, not implemented behavior or duplicate live task status.

## Post-deletion assessment

The initial source retirement reduces `TrainingTodaySetup.tsx` from 1,473 to 530 lines. It already delegates account recipes and availability to domain hooks; another extraction is not justified by its size alone. `DictionarySearchTab.tsx` remains 982 lines and `TrainingScreen.tsx` 2,864. Keep their further decomposition outside this retirement change so behavior changes are attributable.

The next useful Library boundary is the non-grouped/list-filter search request owner: request identity, debounce, abort/stale fencing, freshness reuse, pagination resets and retry. Grouped search stays in its existing hook; selected details and public entry APIs stay outside this extraction. Characterize language isolation, scope changes, stale queries and retained details first.

The later Training boundary is a narrow snapshot/reconciliation decision projection. Preserve one owner for generation refs, accepted mutations, queue loading/reset and invalidation subscriptions. Its acceptance must include takeover, offline recovery, session A/B late responses, resume and coalesced/retried replans. Do not replace the screen with a catch-all hook.

Before further structural extraction, reconcile the remaining browser contracts with the approved UI. Separate speculative reading-size prototype measurements from accepted Training measurement/action contracts; preserve the latter. Migrate unified-details geometry to its article role and current account size model without weakening selection, lookup, focus or overflow checks. Treat reproduced focus/reflow issues as separate behavioral fixes, not changes hidden in retirement.

Style audit comparison also found pre-existing untokenized styles in `trainingOverview.module.css` and excess literals in `approvedTrainingCard.module.css` and `startupLogo.module.css`. The baseline also reported excess literals in `DictionarySearchTab.tsx`, eliminated by this retirement. Existing debt allowances were lowered after deletion; no new allowance was added to hide unrelated failures.

## Bounded release-readiness follow-up (2026-10-08)

Owner authorized [the finite follow-up](../../discussions/2026-10-08-01-retirement-release-readiness.md). Complete browser-contract classification, three existing style-audit violations, and relevant confirmed focus/reveal/viewport behavior. Final acceptance: integrated reviewable changes, necessary checks, independent review, and explicit release verdict with remaining blockers. No Library/TrainingScreen decomposition, merge or deployment in this goal.

Workers start from d120b18e on new local branches, preserving prior worker commits. Root owns the single shared validation runtime and final integration. Large unrelated defects become separately scoped blockers rather than indefinite expansion.

### Follow-up changes and evidence interpretation

Three style violations are resolved with the existing theme ownership, without increasing debt allowances: overview sizes now use matching tokens; approved-card literals use established theme values; startup keeps its own 14px/unscaled font and neutral light/dark colors. `check:practice-styles` passes (shared-theme guard and legacy literal ratchet, 389 remaining). This is not a claim that all remaining style debt is removed.

Report's terminal success body now retains its sole Close action under Tab/Shift+Tab, with Escape dismissal and opener focus characterized. Reveal tests assert the approved whole-card shell, exact text and origin geometry, inert/aria-hidden overlay, grading lock and reduced motion, rather than the superseded isolated-prompt animation.

The prior Google-font response mock returned URL text as font bytes, so browser measurements used fallback faces. Deterministic fixtures now contain valid, unmodified upstream Inter Latin/Cyrillic and Newsreader normal/italic WOFF2 with OFL texts, retrieval provenance and SHA-256. The font-readiness helper verifies the exact loaded subset/style. Earlier fallback-font screenshots remain historical evidence; do not reuse them as proof of intended font geometry. New generated screenshots are retained locally and do not replace tracked historical design artifacts.

Approved browser measurements follow the accepted shared display/literary roles, scalable action sizes and current article geometry. The unapproved reading-size prototype matrix was removed. Its supported overflow coverage is preserved in real-component reflow tests: reverse prompt/hint and long selected translation; the latter checks the final rendered line, not impossible containment of a paragraph taller than its scroll pane. Header padding and example/idiom/usage typography parity remain checked.

The short-screen scroll race was test-side: stress layout changed during Space's smooth scroll. Tests now await native `scrollend` before the next action, retaining end-position, overflow, viewport and pinned-action assertions. The failing case passed three repetitions; all eight Extra reflow cases passed. Mocked transport tests no longer require a live dev-login backend; current localized labels and saved-training entry points replace retired selectors.

The opt-in attribution benchmark remains separate debt. Bounded diagnostics show an accepted action and advancement to word 2, but the finite-session fixture supplies no matching `transition.start`/total telemetry event (scheduler 0, session requests 4, projections 6). This is not evidence of a hung card or a green performance budget. The test's original one-second budget and 120-second deadline were not relaxed; diagnostics now fail with a bounded per-transition capture. No scheduler/controller redesign is included here.

The old PR-head browser CI run 37691004580 was cancelled after 35 minutes while repeating obsolete fixtures/invalid-font failures. Its partial logs are preserved, but it is neither a completed browser-suite result nor evidence for the follow-up head. Fresh CI must be judged on the final submitted head.

The first completed follow-up normal run was 181 passed / 5 failed / 1 optional benchmark skipped, and the first pilot run was 23 passed / 1 failed. These were completed diagnostic runs, not green acceptance evidence. Remaining old selectors/measurements were migrated without runtime changes: actual phone/desktop settings profiles and accepted scaling, whole-card reveal, and current saved-training builder entry. The attention test waited for its first receipt instead of all already accrued time; delivered-total polling retains the original lower/upper bounds and 17-second modal pause. Details geometry sampled different frames during the native 460ms panel slide; waiting for the actual animation retains strict right-edge/spacing checks. Six parallel repetitions of the long-headword case passed.

Independent Sol review through `074fc88bfd7231b3779b8e13584e4049571723f9` found no code or coverage blocker. All worker worktrees are clean, committed and retained; root owns final documentation/evidence. The follow-up runtime source is unchanged after `e4f42dbde22813423681b7045ff107f98238caf0`; later commits only strengthen/migrate tests, fixtures/licenses and documentation. Build/unit results at that runtime checkpoint remain applicable, with a verified empty diff for app/components/lib/styles.

### Final local acceptance

Code/test checkpoint: `074fc88bfd7231b3779b8e13584e4049571723f9`; final documentation commits do not change application or test source.

- Complete normal Playwright phase: **186 passed, 1 existing opt-in attribution benchmark skipped**, 187 discovered; 2 workers, 0 retries, 3.7 minutes.
- Complete pilot phase: **24 passed**, 1 worker, 0 retries. Both phases of the normal `test:e2e` split are covered on the canonical 3100 local QA server; fixture transport is mocked. No FSRS/backend mutation validation is inferred from these browser runs.
- Full Vitest: **235 files passed, 2,055 tests passed, 339 optional tests skipped**. No runtime changes followed this run.
- Production build, final typecheck/lint, style audit, retirement guard, guidance drift and whitespace checks pass. Existing `handlePlayAudio` dependency and route-config re-export warnings remain.
- Independent review accepted the final code and retained behavior coverage. Targeted repeats additionally cover the former scroll, attention-delivery and panel-animation races.

Local acceptance is green. Final publication readiness also requires fresh CI on the submitted PR head and the owner's release decision; #611 remains draft and #610 remains in progress. Exact-head CI outcome and the final checkpoint are recorded on issue #610 and in the local evidence manifest rather than inferred from old cancelled runs. No merge/deployment was performed. The finite follow-up stops here after that verdict; Library list-search extraction, Training snapshot/reconciliation extraction and optional attribution alignment remain separate work.

Evidence: `/Users/khrustal/adhoc/2000nl-610-retirement-evidence/readiness-2026-10-08/` contains passed/failing diagnostic logs, final logs, synthetic screenshots, health, worktree review, bounded attribution capture and SHA-256 manifest. Generated screenshots do not overwrite tracked design history. Worker branches/checkouts are preserved for review.

### Final-head CI readiness correction

CI run 37698227186 on `64ff6b6d0bbca881002872445764eb4d54d1135a` completed with 234 unit files / 2,052 tests passed and three TrainingScreen cases failed; browser smoke was not reached. Other checks, including FSRS parity/RPC, passed. Do not call that CI green.

The two foreign-owner cases queried Start before the startup gate exposed accessible content; the discard-draft case queried Start synchronously during the asynchronous return transition. `5574df81` adds positive accessible-ready waits in only those tests. Claim failure, no-actionable-card, session identity, one stats request and active scope assertions are retained. No deadlines, production runtime or browser-source changes. Focused CI-mode cases (3/3), the whole TrainingScreen file (78/78), and independent review pass. Browser acceptance at `074fc88b` and live runtime/health smoke at `64ff6b6d` remain applicable because their source has an empty diff after this correction. Fresh submitted-head CI remains the final gate.

Full root `CI=true` Vitest at `5574df81`: **235 files passed, 2,055 tests passed, 339 optional tests skipped**, 126.3 seconds; all 78 TrainingScreen cases pass. This supersedes the earlier unit acceptance for the corrected test source. The change was independently reviewed without findings.
