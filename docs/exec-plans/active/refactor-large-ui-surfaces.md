# Refactor Large UI Surfaces

## Goal

Prepare a low-risk refactor plan for the largest UI files without changing the training experience before the planned designer review is incorporated.

## Context

Current large files:

- `apps/ui/components/training/TrainingScreen.tsx` - roughly 2.7k lines; owns session orchestration, settings persistence, audio/TTS, onboarding, sidebars, queue transitions, and action handling.
- `apps/ui/components/training/TrainingCard.tsx` - roughly 1.4k lines; owns card rendering across modes, translations, examples, idioms, badges, audio affordances, and reveal states.
- `apps/ui/lib/trainingService.ts` - roughly 1.8k lines; owns Supabase RPC calls, mapping, list/search operations, review recording, preferences, and fallbacks.

The user plans to review selected screens with a designer and may change the UI direction afterward. Do not do visual restructuring, layout rewrites, naming-copy changes, or component extraction that would make designer feedback harder to apply.

## Constraints

- Preserve rendered UI and user workflows unless a separate product/design task explicitly says otherwise.
- Keep extraction mechanical and behavior-preserving.
- Prefer pure helper extraction, typed service modules, and small hooks over moving JSX into new visual components.
- Do not change training card layout, spacing, copy, or responsive behavior as part of this refactor.
- Keep tests green after each small step.

## Suggested Agent Task

Analyze the three large files and propose a staged decomposition plan. The output should be a concrete, file-by-file plan rather than implementation.

Include:

- responsibility map for each file
- candidate extraction boundaries
- safest first extraction with low merge/design risk
- tests that should protect each extraction
- risks from pending designer review
- changes explicitly out of scope until design direction is final

Recommended initial extraction candidates:

- `trainingService.ts`: split typed mappers and list/search helpers from review/session RPC helpers.
- `TrainingScreen.tsx`: extract non-visual hooks for persisted settings, training debug state, and audio/TTS orchestration.
- `TrainingCard.tsx`: postpone visual component extraction until designer review; only consider pure text/translation helper extraction first.

## Validation

- `cd apps/ui && npm run lint`
- `cd apps/ui && npm test`
- If any visual extraction is later approved, verify with Playwright/screenshots before merging.

## Progress

- 2026-05-16: Incorporated architect review decision into this plan.
- 2026-05-16: Completed Stage 1 mapper extraction by adding `apps/ui/lib/training/wordMappers.ts`, updating `trainingService.ts` to import the helpers, and adding `apps/ui/tests/trainingService.mappers.test.ts`.
- 2026-05-16: Validation passed:
  - `cd apps/ui && npm test -- tests/trainingService.mappers.test.ts tests/trainingService.recordReview.test.ts`
  - `cd apps/ui && npm run lint`
  - `cd apps/ui && npm test`
- 2026-05-16: Started Stage 0 characterization for service splitting by adding `apps/ui/tests/trainingService.selection.test.ts` covering next-card selection payloads, scenario/list forwarding, cross-reference retries, `stability` to `ef`, first-encounter mode forcing, and legacy-vs-scenario fallback behavior.
- 2026-05-16: Extended Stage 0 characterization by adding `apps/ui/tests/trainingService.listsPreferences.test.ts` covering curated-list `sort_order` fallback, gated search payload/result mapping, hidden/frozen fallback filtering, user-list auth guard, active-list fetch/update, preference defaults, legacy mode fallback, translation `"off"`, and audio-quality default seeding.
- 2026-05-16: Started Stage 2 service split behind the compatibility barrel by moving user preferences into `apps/ui/lib/training/preferencesService.ts` and re-exporting from `trainingService.ts`.
- 2026-05-16: Added dictionary lookup characterization and continued Stage 2 by moving training-word/dictionary lookup helpers into `apps/ui/lib/training/dictionaryService.ts` behind the `trainingService.ts` barrel.
- 2026-05-16: Added review side-effect characterization and moved review/view/click/debug helpers into `apps/ui/lib/training/reviewService.ts` behind the `trainingService.ts` barrel.
- 2026-05-16: Added stats/history characterization and moved detailed stats plus recent-history hydration into `apps/ui/lib/training/statsHistoryService.ts` behind the `trainingService.ts` barrel.
- 2026-05-16: Continued Stage 2 by moving list summary and active-list helpers into `apps/ui/lib/training/listService.ts` behind the `trainingService.ts` barrel; search/list words/mutations remain for the next slice.
- 2026-05-16: Completed the remaining list/search split by moving word search, list word loading, user-list mutations, and membership helpers into `apps/ui/lib/training/listService.ts`; `trainingService.ts` still re-exports the public API and only imports `fetchWordsForList` for legacy next-card fallback.

## Analysis Output

Snapshot date: 2026-05-16.

Current measured sizes:

- `apps/ui/components/training/TrainingScreen.tsx` - 2,685 lines.
- `apps/ui/components/training/TrainingCard.tsx` - 1,395 lines.
- `apps/ui/lib/trainingService.ts` - 1,791 lines.

This plan intentionally favors mechanical extraction and service decomposition over visual component changes. The pending designer review makes JSX/layout movement the highest-risk category.

## Architect Review Decision

Architect review status: approved with changes.

Proceed before designer review only with non-visual extraction:

- Service mapper extraction behind the existing `trainingService.ts` barrel.
- Domain-shaped service module splitting behind the barrel.
- Pure queue helpers.
- Pure `TrainingCard` text helpers.
- Carefully tested non-visual hooks.

Wait until after designer review for:

- `TrainingCard` visual component extraction.
- `TrainingScreen` header/footer/sidebar/layout JSX extraction.
- Any card spacing, copy, class cleanup, icon replacement, scroll behavior, reveal animation, card-height, queue policy, or FSRS behavior changes.

Key review changes incorporated below:

- Add Stage 0 characterization tests before risky hook/session/card translation extraction.
- Split future service modules by narrower domains instead of a broad permanent `sessionService.ts`.
- Extract `TrainingScreen` queue helpers before hooks, and postpone full `useTrainingSession`.
- Do not move `parseEntry`, `EVENT_MAP`, or `trainingCardBadges.ts` in the first pass unless separately justified.

## Responsibility Map

### `apps/ui/lib/trainingService.ts`

Current responsibilities:

- Supabase row normalization and dictionary-entry mapping.
- Training-word lookup and next-card RPC selection.
- Scenario RPCs and scenario stats.
- Review, click, and optional FSRS debug RPCs.
- Detailed training stats and recent-history hydration.
- Curated/user list listing, word search, list word search, list membership and active-list persistence.
- User preferences read/write and defaults.
- Compatibility fallbacks for older DB/RPC deployments.

Main coupling points:

- `TrainingScreen.tsx` imports most exports directly.
- `SettingsModal`, `Sidebar`, and list-management UI likely depend on list/search/preference exports.
- FSRS tests depend on review/session behavior and RPC signatures.

### `apps/ui/components/training/TrainingScreen.tsx`

Current responsibilities:

- Training session orchestration: current card, reveal state, first encounter behavior, action submission, prefetch, review history updates.
- User preference hydration and persistence: modes, filter, language, theme, audio quality, translation language, active scenario, new/review ratio, sidebar pinning.
- Active list hydration, auto-selection, list switching, settings refresh.
- Stats and recent-history loading.
- Onboarding/Joyride state and persistence.
- Keyboard shortcuts and mobile swipe gestures.
- Audio URL resolution, audio playback, sentence TTS, audio mode persistence.
- Sidebar/drawer state, details selection, dictionary click lookup.
- Full screen/header/card/footer/modal JSX composition.

Main coupling points:

- Calls `trainingService` directly for every data operation.
- Passes many state slices into `TrainingCard`, `FooterStats`, `Sidebar`, `TrainingSidebarDrawer`, and `SettingsModal`.
- Local state changes are intentionally intertwined with current UI behavior, so extraction should start with hooks that preserve the existing prop flow.

### `apps/ui/components/training/TrainingCard.tsx`

Current responsibilities:

- Card chrome, loading/empty states, scroll fade hints, tap-to-reveal behavior.
- Word-to-definition and definition-to-word rendering.
- POS/gender badges, meaning-number badges, idiom badges and tooltips.
- Definition/headword masking for hidden-answer prompts.
- Translation fetching, polling, long-press retranslation, inline translation rendering.
- Interactive text rendering for definitions, examples, contexts, and idioms.
- Audio-mode cursor/controls and headword audio click affordance.
- Debug stats footer rendering.

Main coupling points:

- Visual behavior is covered by targeted component tests and likely by designer feedback soon.
- Pure helper behavior is locally defined (`maskTargetWordInDefinition`, POS maps, translation lookup helpers) and can be extracted with low visual risk.
- Translation side effects are internal but non-visual enough to become a hook after pure helper extraction.

## Candidate Extraction Boundaries

### Service Layer

Low-risk modules:

- `apps/ui/lib/training/wordMappers.ts`
  - Move `normalizeRaw`, `mapDictionaryEntry`, list-summary mappers, scenario mapper, event-to-result mapper.
  - Export only typed helpers needed by service modules.
- `apps/ui/lib/training/dictionaryService.ts`
  - Move `fetchTrainingWordById`, `fetchTrainingWordByLookup`, `fetchDictionaryEntry`.
- `apps/ui/lib/training/listService.ts`
  - Move `fetchCuratedLists`, `fetchUserLists`, `fetchAvailableLists`, `searchWordEntries`, `fetchWordsForList`, list mutation/membership helpers, active-list helpers.
- `apps/ui/lib/training/preferencesService.ts`
  - Move `UserPreferences`, `fetchUserPreferences`, `updateUserPreferences`.

Medium-risk modules:

- `apps/ui/lib/training/selectionService.ts`
  - Move `fetchNextTrainingWord`, `fetchNextTrainingWordByScenario`, cross-reference skipping, RPC payload construction, and list fallback behavior.
- `apps/ui/lib/training/reviewService.ts`
  - Move `recordReview`, `recordWordView`, `recordDefinitionClick`, and `fetchLastReviewDebug`.
- `apps/ui/lib/training/statsHistoryService.ts`
  - Move `fetchStats` and `fetchRecentHistory`.
- Keep `apps/ui/lib/trainingService.ts` as a compatibility barrel during the refactor so existing imports do not churn.

Do not split the Supabase client or replace query logic during this pass.

### Training Screen

Low-risk hooks/helpers:

- `apps/ui/components/training/usePersistedTrainingPreferences.ts`
  - Own preference hydration plus persisted setters for theme, audio quality, modes, filter, language, ratio, translation language, scenario, and sidebar pinning.
  - Preserve existing setter names in the returned object to minimize call-site edits.
- `apps/ui/components/training/useTrainingAudio.ts`
  - Own `audioModeEnabled` localStorage persistence, `ttsLoading`, `resolveAudioUrl`, `preloadAudioForWord`, `playAudio`, and `playSentenceTTS`.
  - Keep dictionary lookup in `TrainingScreen` initially; move it into the hook only after tests cover click/audio behavior.
- `apps/ui/components/training/trainingQueue.ts`
  - Move queue transition logic into a pure helper returning both next `queueTurn` and next `reviewCounter`.
  - Keep prediction and imperative advancement behavior sharing the same transition helper so they cannot drift.
- `apps/ui/components/training/reviewTurnId.ts` or `trainingQueue.ts`
  - Move `generateReviewTurnId`.
  - Add direct unit tests where practical.
- `apps/ui/components/training/useOnboardingTour.ts`
  - Own Joyride state, language selection, completion persistence, dark-mode observer, and step building.
  - Return state/handlers/styles needed by existing JSX.

Medium-risk hooks:

- `apps/ui/components/training/useActiveTrainingList.ts`
  - Own active-list hydration, available-list refresh, primary auto-select, list switching, and list-updated reconciliation.
  - Risk is reload sequencing with current card and stats.
- `apps/ui/components/training/useTrainingSession.ts`
  - Own current word, reveal/hint state, queue turn, prefetch, stats/history loading, review submission, and first encounter handlers.
  - This should wait until the smaller hooks above reduce the file and tests are stronger.
- `apps/ui/components/training/useTrainingSwipe.ts`
  - Own touch start/move/end and swipe-derived presentation state.
  - Low visual-code movement, but behavior is mobile-specific and should be extracted only with existing swipe tests green.

Avoid extracting header/card/footer JSX before designer review.

### Training Card

Low-risk helper modules:

- `apps/ui/components/training/trainingCardText.ts`
  - Move `escapeRegExp`, `maskTargetWordInDefinition`, possibly prompt/definition text selectors.
  - Add direct unit tests for headword masking, inflected suffixes, punctuation boundaries, and empty input.

Medium-risk hook:

- `apps/ui/components/training/useTrainingCardTranslation.ts`
  - Own translation status, overlay, error, fetch/poll/long-press timer cleanup, `getTranslated`, `getHeadwordTranslated`, status text.
  - Keep inline translation JSX inside `TrainingCard` until designer review.

Postpone:

- JSX extraction for card header, toolbar, meaning rows, idiom rows, examples, debug footer, and scroll fades.
- CSS class rewrites, lucide/icon changes, copy updates, rounded-corner changes, or layout simplification.

## Safest First Extraction

First extraction should be `trainingService.ts` mappers plus a compatibility barrel.

Why:

- It does not touch rendered UI.
- It reduces the broadest shared file without changing import sites.
- The moved functions are deterministic and mostly pure.
- It sets up later service splitting with smaller diffs.

Concrete first patch:

1. Add `apps/ui/lib/training/wordMappers.ts`.
2. Move only pure used helpers: `normalizeRaw`, `isCrossReferenceOnly`, `mapDictionaryEntry`, `mapCuratedListSummary`, `mapUserListSummary`, `mapScenario`, and `mapEventTypeToResult`.
3. Update `trainingService.ts` to import these helpers and keep all public exports unchanged.
4. Add or extend unit tests for raw normalization, dictionary mapping, list summary mapping, cross-reference detection, and event-result mapping.
5. Run `cd apps/ui && npm run lint` and targeted tests first, then `cd apps/ui && npm test` if the narrow checks pass.

Do not include `parseEntry` or `EVENT_MAP` in the first extraction. They are currently unused in the inspected repo. Leave them in place or remove them later in a separate dead-code cleanup patch.

Second extraction should be `TrainingScreen` pure queue helpers:

1. Add `apps/ui/components/training/trainingQueue.ts`.
2. Extract a pure queue transition helper that returns both next `queueTurn` and next `reviewCounter`.
3. Move `generateReviewTurnId` into `trainingQueue.ts` or a small `reviewTurnId.ts`.
4. Add unit tests for queue transition parity, prediction/advance consistency, and UUID fallback behavior where practical.
5. Run `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx` plus the new helper test.

Third extraction should be `TrainingCard` text helpers:

1. Add `apps/ui/components/training/trainingCardText.ts`.
2. Move `escapeRegExp` and `maskTargetWordInDefinition`.
3. Add direct unit tests for masking before touching any JSX.
4. Run `cd apps/ui && npm test -- tests/TrainingCard.test.tsx` plus the new helper test.

## Suggested Stages

### Stage 0 - Characterization Tests

Add tests for behavior that is not yet protected well enough for extraction.

Before service splitting beyond mappers:

- Next-card selection RPC payload shape.
- Scenario id forwarding.
- List scope forwarding.
- `cardFilter` and `queueTurn` forwarding.
- Cross-reference skipping.
- `stats.stability` to `debugStats.ef` mapping.
- First-encounter mode forcing.
- Legacy `fetchNextTrainingWord` list fallback versus scenario-based selection returning `null`.

Before list/preference service splitting:

- Gated RPC fallback.
- Missing `sort_order` fallback.
- User-list ownership fallback.
- Hidden/frozen filters.
- Active-list fetch/update.
- Preference defaults.
- Legacy `training_mode` fallback.
- `translation_lang` `"off"` handling.
- Audio-quality env default behavior on new settings rows.

Before `TrainingScreen` hook extraction:

- Queue transition parity.
- Initial mount loads one first card after list hydration.
- Local-first preference setters.
- `cardFilter === "both"` queue reset.
- Scenario change loads using the new scenario, not stale state.
- Active-list deleted fallback.
- Primary list auto-selection.
- Sidebar pin persistence.
- Audio mode localStorage.
- TTS payload quality.
- Onboarding preference merge behavior.

Before `TrainingCard` translation hook extraction:

- Translation preload on reveal.
- T hotkey open/close behavior.
- Pending poll.
- Failed status text.
- Long-press force refresh.
- Timer cleanup on unmount/card change.

Protected by:

- Run each new narrow test as it is added.
- Then `cd apps/ui && npm run lint`.
- Then `cd apps/ui && npm test`.

### Stage 1 - Non-visual Service Mappers

Files:

- Add `apps/ui/lib/training/wordMappers.ts`.
- Update `apps/ui/lib/trainingService.ts`.
- Add `apps/ui/tests/trainingService.mappers.test.ts`.

Protected by:

- `cd apps/ui && npm test -- tests/trainingService.mappers.test.ts tests/trainingService.recordReview.test.ts`
- `cd apps/ui && npm run lint`

Risks:

- Mapper exports can accidentally widen `any` usage or create circular imports if they import from `trainingService.ts`. The mapper module should import only types from `apps/ui/lib/types`.
- Do not move unused `parseEntry` or `EVENT_MAP` in this patch.

### Stage 2 - Domain Service Split Behind Barrel

Files:

- Add `apps/ui/lib/training/dictionaryService.ts`.
- Add `apps/ui/lib/training/listService.ts`.
- Add `apps/ui/lib/training/preferencesService.ts`.
- Add `apps/ui/lib/training/selectionService.ts`.
- Add `apps/ui/lib/training/reviewService.ts`.
- Add `apps/ui/lib/training/statsHistoryService.ts`.
- Keep `apps/ui/lib/trainingService.ts` re-exporting all existing public functions and types.
- Do not update component imports in the first pass.

Protected by:

- Existing `TrainingScreen` tests.
- Settings/sidebar tests if present.
- Stage 0 service/list/preference characterization tests.
- `cd apps/ui && npm test -- tests/trainingService.recordReview.test.ts`
- `cd apps/ui && npm test`

Risks:

- List/search helpers include fallback paths for missing gated RPCs and user-specific filters. Preserve exact query order and return shapes.
- `recordReview` has legacy RPC fallback behavior and turn-id idempotency. Preserve call order exactly.
- `fetchNextTrainingWord` fallback depends on `fetchWordsForList`; avoid circular imports between selection and list services.
- A broad permanent `sessionService.ts` is explicitly not the desired final shape.

### Stage 3 - TrainingScreen Pure Queue Helpers

Files:

- Add `apps/ui/components/training/trainingQueue.ts`.
- Optionally add `apps/ui/components/training/reviewTurnId.ts`.
- Update `TrainingScreen.tsx` to use shared queue transition and turn-id helpers.

Protected by:

- New queue helper tests.
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm run lint`

Risks:

- Prediction logic for prefetch and imperative advancement logic for review submission must not drift.
- Preserve current double-submit, prefetch, turn-id, and first-encounter behavior.

### Stage 4 - TrainingScreen Preferences Hook

Files:

- Add `apps/ui/components/training/usePersistedTrainingPreferences.ts`.
- Update `TrainingScreen.tsx` call sites only.

Protected by:

- Stage 0 preference tests.
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm run lint`

Risks:

- Preference setters currently update local state synchronously and persist asynchronously. The hook must keep that behavior.
- `cardFilter === "both"` currently resets queue rotation. Preserve this side effect.
- If the diff gets large, move only a subset of preferences first.

### Stage 5 - TrainingScreen Audio Hook

Files:

- Add `apps/ui/components/training/useTrainingAudio.ts`.
- Move `audioModeEnabled`, localStorage persistence, `ttsLoading`, `resolveAudioUrl`, `preloadAudioForWord`, `playAudio`, and `playSentenceTTS`.
- Keep dictionary click handling in `TrainingScreen` at first.

Protected by:

- Stage 0 audio tests.
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm run lint`

Risks:

- Audio APIs are browser-only. Keep existing `typeof window` and `typeof Audio` guards.
- TTS payload must continue to use selected audio quality.

### Stage 6 - TrainingScreen Onboarding Hook

Files:

- Add `apps/ui/components/training/useOnboardingTour.ts`.
- Move Joyride state, language selection, completion persistence, dark-mode observer, and step building.
- Keep rendered Joyride JSX in `TrainingScreen` unless/until visual extraction is approved.

Protected by:

- Stage 0 onboarding preference merge tests.
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm run lint`

Risks:

- Onboarding reads/writes the `preferences` JSONB object. Preserve merging so it does not clobber other preference updates.
- Onboarding language detection depends on `translationLang`; preserve dependency semantics.

### Stage 7 - Active List Hook

Files:

- Add `apps/ui/components/training/useActiveTrainingList.ts`.
- Move active-list hydration, available-list refresh, primary auto-selection, list switching, and list-updated reconciliation.

Protected by:

- Stage 0 active-list tests.
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm run lint`

Risks:

- Reload sequencing with current card and stats is subtle.
- Deleted active list and settings-driven list updates must keep footer and next-card loading in sync.

### Stage 8 - TrainingCard Pure Text Helpers

Files:

- Add `apps/ui/components/training/trainingCardText.ts`.
- Move `escapeRegExp` and `maskTargetWordInDefinition`.
- Do not move badge classes or visual JSX.

Protected by:

- New direct text helper tests.
- `cd apps/ui && npm test -- tests/TrainingCard.test.tsx`
- `cd apps/ui && npm run lint`

Risks:

- Mask exact words and allowed inflected suffixes, but do not mask inside another word.
- Preserve punctuation, apostrophe/hyphen, casing, and empty input behavior.

### Stage 9 - TrainingCard Translation Hook

Files:

- Add `apps/ui/components/training/useTrainingCardTranslation.ts`.
- Move translation status, overlay, error, fetch/poll/long-press timer cleanup, translated text lookups, and status text.
- Keep visual translation rendering inside `TrainingCard`.

Protected by:

- Stage 0 translation tests.
- `cd apps/ui && npm test -- tests/TrainingCard.test.tsx`
- `cd apps/ui && npm run lint`

Risks:

- Hooks must still run before loading/null early returns.
- Translation state clears on `word.id` or language change.
- Reveal preloads translation.
- Pending status polls only while open.
- Long-press sends `force=1` and suppresses the following click toggle.
- Timers clear on unmount and card/language changes.

### Stage 10 - Full Training Session Hook

Files:

- Add `apps/ui/components/training/useTrainingSession.ts` only after stages 0-7 are complete and green.
- Move current word, reveal/hint state, queue turn, prefetch, stats/history loading, review submission, and first encounter handlers.

Protected by:

- Stage 0 session tests.
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm run lint`
- FSRS DB-backed tests when DB access is available:
  `cd apps/ui && FSRS_TEST_DB_URL="$SUPABASE_DB_URL" npm test -- tests/fsrs/*.test.ts`

Risks:

- This is the riskiest screen extraction. It combines current card state, reveal state, queue turn, `reviewedInSessionRef`, prefetch, turn-id idempotency, stats refresh, recent history, first-encounter behavior, list scope, and action double-submit protection.
- `handleScenarioChange` currently sets scenario state and immediately calls `loadNextWord`; pin intended behavior with a test before extracting.
- Initial load suppresses exhaustive dependencies intentionally; hook extraction must not introduce double-loading.

### Stage 11 - Optional Visual Decomposition After Designer Review

Only after design direction is final, consider extracting visual components such as card toolbar, meaning rows, idiom rows, and screen header/sidebar containers.

Protected by:

- `cd apps/ui && npm test`
- `cd apps/ui && npm run test:e2e`
- Playwright screenshots for mobile and desktop training flows.

Risks:

- This is where designer feedback can conflict with code movement. Defer until mockups/review notes are incorporated.

## Existing Test Coverage To Preserve

- `apps/ui/tests/TrainingScreen.test.tsx`
  - Keyboard grading.
  - Double-submit guard.
  - Mobile card height classes.
  - First encounter swipe behavior.
- `apps/ui/tests/TrainingCard.test.tsx`
  - Headword/definition rendering.
  - Headword audio click callback.
  - Tap-to-reveal callback.
  - Perfect participle hiding/showing.
  - Badge gutter behavior.
- `apps/ui/tests/trainingService.recordReview.test.ts`
  - `recordReview` turn-id forwarding.
  - Legacy signature fallback.
- `apps/ui/tests/fsrs/*.test.ts`
  - DB/RPC parity and FSRS behavior, when `FSRS_TEST_DB_URL` is available.

Add before or during extraction:

- Mapper tests for `wordMappers.ts`.
- Queue helper tests for `trainingQueue.ts`.
- Text helper tests for `trainingCardText.ts`.
- Preference hook tests once the hook exists, focused on local-first setter behavior and persistence payloads.

## Pending Designer Review Risks

- Moving JSX out of `TrainingCard` before review will make class/copy/layout changes harder to compare and apply.
- Header/footer/sidebar visual extraction in `TrainingScreen` can create merge friction with designer-led UI revisions.
- Renaming labels, changing icon implementation, or "cleaning up" Tailwind classes could create visual diffs unrelated to this refactor.
- Any change to card height, scroll behavior, reveal timing, translation placement, or swipe feedback should be treated as product/design work, not refactor work.

## Explicitly Out Of Scope Until Design Direction Is Final

- Training card layout, spacing, typography, copy, iconography, responsive breakpoints, reveal animation, and scroll fade redesign.
- Header/footer/sidebar visual restructuring.
- Replacing inline SVG icons with a new icon system.
- Consolidating Tailwind classes or restyling buttons.
- Changing training workflows, queue policy, FSRS behavior, onboarding copy, translation behavior, or audio/TTS UX.
- Moving service calls to `apps/api`; this repo currently treats `apps/api` as aspirational for this runtime.
