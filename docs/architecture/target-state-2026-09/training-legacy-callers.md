# Training renderer and learning-action caller inventory

Evidence date: 2026-09-10. Owning issues: 2000NL #142 and #255.
This is a bounded inventory of Training rendering, its review adapter and
external learning actions, not a claim that every legacy path in the repo has
been enumerated. GitHub owns completion status.

## Baselines

- 2000NL fetched main and online health: `f076fba71beb79fa6f689db226cf8685c9db2104`,
  release 0.18.552, DB132, pilot with all four rollout flags enabled.
- PR #295 before this inventory: `113543812e82d5512e9a401e5b0781393901bc57`;
  complete GitHub CI passed, including UI e2e and Platform smoke.
- AudioFilms fetched `origin/main`: `95c7b2fc56d9c295bed0f4533063edf6e7543347`.
  Local checkout `74a5a5c8` is seven commits behind; authoritative findings below
  use `git show`/`git grep origin/main`, not that stale checkout. Deployed
  AudioFilms runtime was not verified in this source audit.
- Pontix local `96c14908ed49b0d138ff305ca4957c3bcac03c77`: clean, one unpushed
  documentation commit. User explicitly parked Pontix; preserve it and record
  reactivation prerequisites without assigning implementation now.

## Exact internal ownership and deletion tests

Paths below are relative to `apps/ui/` unless stated otherwise.

| Path / symbol | Actual caller and reachability | Target / owner | Deletion evidence |
| --- | --- | --- | --- |
| `components/training/TrainingCard.tsx` | Former runtime renderer; no importer remains after the #142 cut. | V2 session for word-to-definition, definition-to-word, listen-recognize; explicit unsupported listen-type. | File deleted; V2 loading, empty, listening, unsupported and ordinary card tests pass. |
| `lib/training/trainingCardPresentation.ts` | Former screen projection used only by the deleted renderer and its tests. | V2 content projection owns the active card. | File and renderer-only tests deleted; focused V2 behavior tests remain. |
| `useLegacyTrainingReviewPort.ts` | Former adapter behind the deleted TrainingScreen review branch. | Platform V2 accepted-action capability owns review transitions. | File deleted; no adapter import, request type, `reviewLegacy` input or `submitLegacyReview` return. |
| Screen `revealed`, hint/translation/swipe state, legacy action buttons and keys | Legacy renderer/footer use these. V2-owned turns suppress the old grade/F/X/space/hint keys. Screen has other live global keys and shared state. | Delete legacy-only state and handlers; preserve History/search/Details and V2 recovery. #142. | Every remaining state field has a live consumer; V2 navigation, side preservation and hotkey tests. |
| Training More `onTrainingAction`, `trainingActionEntryId`, `revealed`, `actionLoading` | Only Screen supplied freeze/hide; `context=training-more` makes `showGlobalDetailsActions=false`. Library callers did not supply freeze/hide. | Dead wiring can be removed immediately under #142/#269. No menu design dependency. | No training-action props in Screen, Library session or LibraryDetailsActions; existing More test still suppresses footer while Collections/Train next work. |
| `lib/training/reviewService.ts` / `recordReview` | Legacy adapter calls this service; tests and trainingService barrel also reference it. Platform has a separate provenance service with the same method name. | Inspect each export when removing adapter; do not delete similarly named Platform functions. #255. | No active UI import of removed export; retain active DB/RPC callers. |
| `lib/training/selectionService.ts` / scheduler RPC overloads | Both next-card and prefetch select `get_next_card` or `get_next_filtered_card`; session-owned turns select `get_next_training_session_card`. | #353 retains the public direct RPCs as stable compatibility entry points and makes the private v2 candidate relation canonical. | No public signature is removed without a new caller audit; private candidate v1 overloads are deleted. |
| `TrainingCard*.test.tsx`, `trainingCardPresentation.test.ts`, legacy-mode Screen tests | Test consumers, including explicit V2-off configuration, not external product consumers. | Migrate supported behavior to V2 and delete obsolete V1-only assertions. | Renderer-only files and V1-only Screen tests deleted; Screen has no skipped cases or mock rollout switch. See the coverage mapping below. |
| Root architecture, package card-types, UI design-guide and older active plans | Documentation references, not runtime callers. | Update current guidance with final deletion; retain dated research as history. #142/#245. | No current guidance instructs use of the removed renderer/RPC. |
| `scripts/test-account.js` (under apps/ui) | Still exposed by package.json `test-account`; writes obsolete `user_word_status` and old membership columns. Do not execute it. | Retire or replace through the canonical verified QA fixture path; #255/#247. | Remove script/package entry and references or test the replacement against current schema, without resetting the populated QA database. |

## Retired test coverage map (#301)

The Screen fixture models the accepted-action boundary, not the V2 card's
internal rendering. Core queue and preparation mocks are reset per test.
Navigation assertions wait for initial background selection and then check
the mounted DOM node and presentation identity. Any subsequent background
selection must exclude the current card; an authoritative reload is forbidden.
The grade stub awaits the asynchronous receipt and transition, matching the
real session's busy lifetime; repeated user events wait for the React boundary.

| Former V1 assertion | Current evidence / disposition |
| --- | --- |
| Details and Recent | Screen V2 overflow and global Details/help tests preserve the turn and forbid global Details footer actions. |
| Inline source/date selectors | Screen pilot Setup test chooses Source/Time window and asserts the committed selector filter; no filter is applied while merely editing the draft. |
| Footer learning-language selector | Removed from the compact V2 session; no replacement in-session control is claimed. Language-scope persistence remains covered in `trainingService.listsPreferences.test.ts`; Library search language isolation is covered in Screen. Future language controls belong to Setup design, not renderer compatibility. |
| Full footer scope summary | `TrainingSessionChrome.test.tsx` projects current scenario/mode/filter; pilot Start commits the full scope. The old multi-line summary is not the accepted compact footer. |
| Search → Train next, failed warmup, copy, one-shot override | Four active Screen integration cases exercise Library and the V2 transition owner. |
| Legacy `recordReview` hotkeys / duplicate submission | `TrainingSenseCardStage.test.tsx` routes grade keys to exact capabilities; `TrainingSenseCardV2Session.test.tsx` checks one mutation for repeated clicks and repeated hotkeys. |
| Old mobile height / scroll wrapper | Screen V2 scroll ownership, `TrainingSessionV2Layout.test.tsx` and Stage scroll/focus tests; desktop/mobile browser smoke remains required. |
| First-encounter swipe `fail` / `hide` | Those V1 action mappings are not current. V2 Stage/Session and projection tests own Start Learning and Mark Known capabilities; Known is not a Hide grade. |
| Advance before review resolves | Rejected old expectation. Screen waits for the prepared DTO; controller/session tests separate accepted, rejected, stalled and presented outcomes. |
| V1 translation overlay Escape/Ctrl+Tab | Overlay removed. V2 Stage tests own face/answer translation visibility; Session tests preserve the mounted card during translation refresh. |

Inactive Screen handlers for the removed inline filters and obsolete F/X
shortcut-help entries are deleted too. Public Freeze/Hide operations and
Start Learning semantics are not changed by this cleanup.

## Scheduler consolidation and bounded compatibility (#353)

The reachability audit at `f7fab6377` found two live server-owned selection
paths, not two removable product features:

| Caller class | Required behavior | Final owner / removal boundary |
| --- | --- | --- |
| `selectionService.ts` before a finite session and after a scope/filter change | Direct `get_next_card` / `get_next_filtered_card` selection, including its daily-cap policy and explicit future-practice switch. | The public RPCs remain compatible entry points and call private v2 directly; any public removal requires a new external-client audit and forward deprecation plan. |
| `get_next_training_session_card`, plan, start and replacement | Finite membership with no daily cap and no future practice. | `private.training_scheduler_candidates_v2` is the sole candidate eligibility body. Session functions call it with daily limits disabled. |
| FSRS/RPC tests, cold-I/O benchmark, deploy probes and historical migrations | Test current public behavior and preserve historical characterization. | Current performance/probe coverage calls the shared v2 body and direct public path. Immutable historical migrations/probes keep their old text as evidence and are not runtime implementations. |
| Connected clients | No raw private scheduler-RPC client is present in the inspected 2000NL, AudioFilms or Pontix source. That is not proof that no client exists. | Private functions are not client-granted. Retain public direct RPC signatures until a separately evidenced API deprecation can remove them. |

Migration 140 removes the only active duplicated candidate query and the
private v1 candidate overloads. `p_enforce_daily_limits` is the one explicit
policy input; the practice-aware public RPC preserves its documented
`review + allowPractice` compatibility case before calling v2. This is the
completed #353 state for #255 and the scheduler prerequisite for #327/#330/#329,
not a second permanent scheduler stack.

## Start Learning remains current

The label `Learn` still invokes `start-learning` in V2. There was no migration
to a synthetic Again grade. PR #280 / migration 130 fixed observability:
enrollment is visible in history and counts as introduced, separately from
recall grades. #290 will simulate the actual queue before changing policy.

V1 `platformActionOrchestrator.ts` routes start-learning either through the
provenance-aware action RPC or directly to `start_learning_entry_card`. V2
`platformV2ActionService.ts` calls `perform_platform_v2_card_action_as_principal`;
its start-learning branch also reaches `start_learning_entry_card` (migration
113). The latest definition is migration 076: it enables FSRS, sets learning,
initial due time now and seen count; it does not create a review grade.
An existing due time is retained. Changing the action name or removing it is
neither necessary nor part of TrainingCard removal.

## External consumers at the fetched source revision

| Consumer | Current path | Remaining work |
| --- | --- | --- |
| AudioFilms semantic SenseCards | `senseCardPresentation.js` emits `platform-action-v2`; `dictionaryOverlayWorkflow.js` forwards the frozen envelope; `app/src/app/api/dict/actions/route.ts` dispatches `dict-sense-card-action-v1` to Platform V2 with state revision and event ID. | Already V2; retain Learn/start-learning semantics. Verify deployed source and mixed-path tests in the AudioFilms-owned task. |
| AudioFilms generated draft save | `generatedEntryWorkflow.js` saves, then emits old `dict-action` with `action: start-learning`; `selectedSpanWorkflow.js` has the same enrollment pattern. | Move remaining callers to current capabilities after saved-entry lookup; preserve retry/event identity and explicit partial failure. Do not invent stateRevision. |
| AudioFilms old overlay and app route | `overlayProjection.ts` still emits old progress actions; action route still accepts both shapes. | Enumerate app/extension/generated callers before deleting old dispatch. Provider README still claims all actions use V1 and needs updating. |
| Pontix | `src/scripts/platformClient.js` calls `/api/platform/v1/actions`, allowing start-learning, known/unknown and review. | Parked by owner. Record required migration before reactivation; no active implementation and no permanent requirement to keep old Training UI. Public API retirement needs explicit treatment of this parked client. |

No import of the private TrainingCard renderer, trainingCardPresentation or
useLegacyTrainingReviewPort was found in either external repository. External clients depend on HTTP
contracts, not the private React renderer.

AudioFilms remaining caller migration is owned by
[AudioFilms #43](https://github.com/vbalashi/audiofilms/issues/43).
Typechecking also found the no-op legacy callback props in
`app/dev/sense-card-gate/UnifiedDetailsGate.tsx`; remove these with the runtime
wiring. This dev fixture is not a production dependency.

## Reproduce the source inventory

`node scripts/check-training-retirements.mjs` is the CI guard for the retired
Details callback symbols across app, components, lib and tests. Run
`node scripts/check-training-retirements.mjs --final-training` checks the
renderer/adapter deletion gates and now passes on the #142 branch. These bounded textual guards do not replace
behavioral tests or the separate scheduler/external API inventory.

Run from the 2000NL root (matches are evidence to classify, not a success exit):

```sh
rg -n 'TrainingCard|trainingCardPresentation|useLegacyTrainingReviewPort|submitLegacyReview|reviewLegacy' apps/ui/components apps/ui/lib apps/ui/tests
rg -n 'onTrainingAction|trainingActionEntryId' apps/ui/components
rg -n 'get_next_card|get_next_filtered_card' apps/ui/lib db/migrations/132* scripts
rg -n 'start-learning' apps/ui/lib/platform apps/ui/components/training/v2
git -C /Users/khrustal/dev/audiofilms grep -n -E 'platform-action-v2|start-learning|postTwoThousandNlPlatformV2Json' origin/main -- app/src extensions/youtube-shadowing/src
```

## Worktree evidence

`origin/main` is `ef91acd9` and PR #300 carries the #142 deletion commits
`51270c02`, `0e0c6841`, and review follow-up `4218a37c`. Closed #297 is clean
and pushed but intentionally unmerged. #137
contains untracked design evidence; #194 contains seven modified screenshots.
Preserve both visual trees. Clean
does not mean integrated, and this audit does not authorize deleting their
unmerged evidence. #143 and draft #144 remain outside the work scope.
