# Search Lists Viewed List Vs Training Scope

## Goal

Implement the second UX-approved search/lists slice: decouple the list the user
is viewing in `Lijsten` from the active training scope used by normal training.

Exact user outcome:

When a user opens `Lijsten` and clicks a curated or user-owned list, the app
only changes the viewed list. The active training list, active scenario, stats,
and next training card do not change unless the user explicitly chooses a
training-scope action.

## Source Documents

- `docs/intent/search-and-lists/index.md`
- `docs/intent/search-and-lists/current-ux-gap-report.md`
- `docs/intent/search-and-lists/ux-review-response.md`
- `docs/intent/search-and-lists/scenarios/manage-list-words.md`
- `docs/intent/search-and-lists/scenarios/choose-training-scope.md`
- `docs/exec-plans/active/search-lists-entry-membership-slice.md`

## Product Semantics

- Viewed list is navigation context: "which list am I inspecting?"
- Active training scope is training configuration: "what will normal training
  use next?"
- Passive browsing, filtering, searching, paging, opening entry detail, and
  selecting a list in `Lijsten` must not change active training scope.
- Changing active training scope must be an explicit action, such as `Make
  active for training`.
- `Train this list now` is a separate temporary-session concept. Do not
  implement it in this slice unless explicitly approved during implementation.
- Dictionary source lists remain source/browsing context, not active training
  targets.

## Current Technical Context

Known coupling to remove:

- `TrainingScreen.handleListChange(list)`
  - Calls `persistListChange(list)`.
  - Applies `list.default_scenario_id`.
  - Calls `loadStats(...)`.
  - Calls `loadNextWord(...)`.
- `SettingsModal`
  - Owns `selectedListId`, initialized from the active training list id.
  - `selectDefaultTrainingList(...)` calls `onListChange(primary)`, which
    changes training scope while the modal is just choosing a list context.
  - Passes `onListChange` into `WordListTab`.
- `WordListTab`
  - Uses `selectedListId` as both list picker/view state and active-looking UI
    state.
  - On desktop curated/user list clicks, calls `setSelectedListId(...)` and
    then `onListChange(list)`.
  - On mobile list picker selection, calls `onListChange(list)`.
  - Shows an `Actieve trainingslijst` card derived from `selectedList`, so the
    viewed list can masquerade as the active training list.
- `DictionarySearchTab` and `WordsToolbar`
  - Use the current selected/viewed list for list filtering. This can remain,
    but the labels must not imply active training scope.
- `FooterStats`
  - Uses `onListChange` as an explicit training-scope selector. This should
    remain a training-scope control, but the naming should be made less
    ambiguous if touched.
- `useTrainingActiveList`
  - Owns persistent active training scope through `persistListChange` and
    `handleListSelectValue`.
  - Keep this hook focused on active training scope, not list browsing.

Relevant files:

- `apps/ui/components/training/TrainingScreen.tsx`
- `apps/ui/components/training/SettingsModal.tsx`
- `apps/ui/components/training/wordlist/WordListTab.tsx`
- `apps/ui/components/training/wordlist/MobileListPickerSheet.tsx`
- `apps/ui/components/training/wordlist/WordsToolbar.tsx`
- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- `apps/ui/lib/training/useTrainingActiveList.ts`
- `apps/ui/tests/TrainingScreen.test.tsx`

## Implementation Scope

In scope:

- Introduce separate viewed-list state in the settings/list-management area.
- Selecting a list in `Lijsten` changes viewed-list state only.
- Add an explicit active-training action in list management for eligible
  learning lists.
- Keep footer list selector as an explicit active-training-scope control.
- Keep list-scoped search/filtering tied to viewed-list state.
- Update labels/copy where needed so "viewed list" and "active training list"
  are not both called active.
- Add focused tests proving passive list selection does not call active-list
  persistence or load a new card.

Out of scope:

- Full redesign of training footer.
- Full effective training scope summary.
- Temporary `Train this list now` session.
- Single-entry quick-practice.
- Advanced sorting, bulk UX, sharing/export, teacher workflows.
- Large component extraction or visual redesign beyond labels and small action
  placement needed for this slice.

## Recommended UI/State Model

Use separate concepts in code:

```ts
type ViewedListState = {
  viewedListId: string | null;
  viewedListType: "curated" | "user" | null;
};

type ActiveTrainingScope = {
  activeListId: string | null;
  activeListType: "curated" | "user" | null;
  activeScenarioId: string;
  cardFilter: CardFilter;
};
```

Do not necessarily introduce these exact exported types if local state is
enough. The implementation should make the distinction clear in prop names and
handler names:

- `viewedListId`
- `setViewedListId`
- `viewedList`
- `onViewedListChange`
- `activeTrainingList`
- `onMakeActiveForTraining`

Avoid using `selectedList` or `onListChange` where the behavior is ambiguous.

## Implementation Steps

1. Add characterization tests before changing behavior.
   - In `TrainingScreen`/settings tests, opening `Lijsten` and clicking a list
     must not call `updateActiveList`, `fetchNextTrainingWordByScenario`, or
     active-scope reload paths.
   - A footer list change should still change active training scope.
   - An explicit `Make active for training` action from `Lijsten` should change
     active training scope.

2. Refactor `SettingsModal` state naming.
   - Replace modal `selectedListId` mental model with viewed-list state.
   - Initialize viewed list from current active training list if available, but
     do not persist or reload training during initialization.
   - When lists load and no viewed list exists, choose a sensible viewed-list
     fallback without calling `onListChange`.
   - Keep the active training scope props from `TrainingScreen` available for
     display and explicit actions.

3. Refactor `WordListTab` props and handlers.
   - Replace `onListChange` with:
     - `onViewedListChange(list)` for browsing;
     - `onMakeActiveForTraining(list)` for explicit active-scope mutation.
   - Desktop curated/user list picker clicks should only update viewed list.
   - Mobile list picker selection should only update viewed list.
   - Rename visual labels:
     - selected/viewed list: `Bekeken lijst` or equivalent;
     - active training list: `Actieve trainingslijst`.
   - The active training list card must be derived from actual active scope, not
     viewed list.

4. Add explicit active-training action.
   - For eligible curated/user learning lists, show an action such as `Maak
     actief voor training`.
   - If the viewed list is already the active training list, show a read-only
     status or disabled current-state action.
   - Dictionary source lists should not be offered as active training targets.
   - On action click, call the active-scope handler that currently lives behind
     `TrainingScreen.handleListChange`.

5. Keep `DictionarySearchTab` and `WordsToolbar` list filtering scoped to viewed
   list.
   - If labels are touched, use viewed-list/filter language, not active-list
     language.
   - `Alleen actieve lijst` should be renamed if it refers to viewed list rather
     than active training list.

6. Preserve real membership behavior from the first slice.
   - Do not reintroduce `selectedListName` or viewed-list context into
     `WordDetailPanel`.
   - Opening details from a viewed list must preserve view context without
     changing membership state or active training scope.

## Acceptance Checks

- Clicking a list in `Lijsten` changes the displayed list contents only.
- Clicking a list in `Lijsten` does not call active-list persistence.
- Clicking a list in `Lijsten` does not load a new training card.
- Footer list selector still changes active training scope.
- Explicit `Make active for training` from list management changes active
  training scope.
- Active training list display reflects the actual persisted active list, not
  the viewed list.
- Viewed list display reflects the list being browsed.
- Dictionary source lists are not offered as active training targets.
- List-filtered search labels do not say active list unless they truly refer to
  active training scope.
- Existing entry membership tests still pass.

## Validation

Run the narrowest relevant checks:

- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx`
- `cd apps/ui && npm test -- tests/useTrainingActiveList.test.tsx`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`

If the UI labels/layout change noticeably, also run a local browser smoke test:

- `cd apps/ui && npm run dev`

Manual smoke states:

- Open `Lijsten`; click a curated learning list; verify training card does not
  change.
- Click a user list; verify training card does not change.
- Use explicit `Make active for training`; verify footer/active scope updates.
- Use footer list selector; verify normal training scope still changes.
- Open entry detail from a viewed list; verify membership remains real data.

## Agent Prompt

Use this prompt for the implementation agent:

```text
You are working in /Users/khrustal/dev/2000nl.

Goal:
Implement the second UX-approved search/lists slice: decouple viewed list from active training scope.

Start by reading:
- docs/exec-plans/active/search-lists-viewed-list-vs-training-scope.md
- docs/intent/search-and-lists/ux-review-response.md
- docs/intent/search-and-lists/index.md
- docs/intent/search-and-lists/current-ux-gap-report.md
- docs/intent/search-and-lists/scenarios/manage-list-words.md
- docs/intent/search-and-lists/scenarios/choose-training-scope.md

Product decisions already made:
- Viewed list is navigation context only.
- Active training scope is training configuration.
- Passive list browsing, filtering, paging, and entry-detail opening must not change active training scope.
- Changing active training scope requires an explicit action.
- Footer list selector may remain an explicit training-scope control.
- Do not implement Train this list now or Train dit woord quick-practice in this slice.

Current problem:
- WordListTab list clicks call onListChange(list).
- In TrainingScreen, onListChange persists active list, applies list default scenario, reloads stats, and loads the next card.
- This means simply viewing a list can change what the user is training.

Implementation target:
- Settings/list-management needs separate viewed-list state.
- Clicking lists in Lijsten changes viewed list only.
- Add an explicit action like Maak actief voor training for eligible learning lists.
- The active training list display must come from real active scope, not viewed list.
- List-filtered search should use viewed-list language, not active-list language.

Likely files:
- apps/ui/components/training/TrainingScreen.tsx
- apps/ui/components/training/SettingsModal.tsx
- apps/ui/components/training/wordlist/WordListTab.tsx
- apps/ui/components/training/wordlist/MobileListPickerSheet.tsx
- apps/ui/components/training/wordlist/WordsToolbar.tsx
- apps/ui/components/training/wordlist/DictionarySearchTab.tsx
- apps/ui/lib/training/useTrainingActiveList.ts
- apps/ui/tests/TrainingScreen.test.tsx
- apps/ui/tests/useTrainingActiveList.test.tsx

Expected tests:
- Add/adjust tests proving list browsing does not call active-list persistence or fetch next training card.
- Preserve tests proving footer active-list changes still work.
- Add/adjust tests for explicit Make active for training action.
- Keep WordDetailPanel membership tests passing.

Run:
cd apps/ui && npm test -- tests/TrainingScreen.test.tsx
cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx
cd apps/ui && npm test -- tests/useTrainingActiveList.test.tsx
cd apps/ui && npm run typecheck
cd apps/ui && npm run lint

Acceptance checks:
- Clicking a list in Lijsten changes displayed list contents only.
- Clicking a list in Lijsten does not persist active list.
- Clicking a list in Lijsten does not load a new training card.
- Footer list selector still changes active training scope.
- Explicit Make active for training changes active training scope.
- Active training list display uses real active scope.
- Viewed list display uses viewed-list state.
- Dictionary source lists are not offered as training targets.
- Entry membership behavior from the previous slice is not regressed.

Before editing:
Inspect current TrainingScreen, SettingsModal, WordListTab, and useTrainingActiveList. If you find a blocker that makes the plan unsafe, stop and explain it with file references. Otherwise implement the slice end to end.
```

## Progress

- Completed on 2026-05-25.

Implemented:

- Split settings/list management into viewed-list state separate from active
  training scope.
- Changed desktop and mobile list picking in `Lijsten` so list clicks only
  change the viewed list.
- Added `Maak actief voor training` for eligible curated/user learning lists.
- Kept the footer list selector as the explicit active-training-scope control.
- Filtered dictionary source lists out of active training targets.
- Renamed list filter labels to viewed-list language.

Validation:

- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/WordDetailPanel.membership.test.tsx tests/useTrainingActiveList.test.tsx`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`
- `git diff --check`
