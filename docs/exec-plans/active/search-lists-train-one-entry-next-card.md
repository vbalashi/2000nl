# Search Lists Train One Entry Next Card

## Goal

Define and implement `Train dit woord` as a one-shot next-card override.

Exact user outcome:

When a user opens an entry from search, list detail, or the details sidebar and
clicks `Train dit woord`, the normal training screen focuses the selected entry
as the next card once. After that card is answered, normal training resumes from
the existing active training scope.

## Source Documents

- `docs/intent/search-and-lists/current-ux-gap-report.md`
- `docs/intent/search-and-lists/ux-review-response.md`
- `docs/intent/search-and-lists/scenarios/train-one-entry-now.md`
- `docs/intent/search-and-lists/scenarios/find-word-understand.md`
- `docs/intent/search-and-lists/scenarios/find-word-add-to-list.md`
- `docs/exec-plans/active/search-lists-entry-membership-slice.md`
- `docs/exec-plans/active/search-lists-viewed-list-vs-training-scope.md`
- `docs/exec-plans/active/search-lists-lookup-scope-ux-slice.md`

## Product Semantics

- `Train dit woord` means "make this entry the next training card once."
- The action does not change the active training list.
- The action does not change the viewed list.
- The action does not add or remove list membership.
- The action does not persist a new active training scope.
- The action does not create a separate one-entry practice session.
- After the override card is answered, normal training continues from the
  existing active scope.

## Implementation Notes

- `TrainingScreen` owns the override as local, in-memory state.
- The override is consumed by `loadNextWord` before normal scheduler selection.
- The selected entry is loaded with `fetchTrainingWordByLookup`.
- The card mode uses the current card mode when available, then falls back to
  the first enabled mode. This keeps the override aligned with the current
  training flow as far as the non-scheduler lookup path allows.
- If the selected entry cannot be loaded, the app shows a visible fallback
  message and continues with normal scheduler selection.
- Entry detail copy states that the word becomes the next card once and that the
  active training list remains unchanged.

## Acceptance Checks

- Clicking `Train dit woord` from entry detail schedules that entry as the next
  card.
- Active training list persistence is not called.
- Viewed-list state is not changed.
- List membership is not added or removed.
- The override is one-shot.
- After answering the override card, normal training resumes from the active
  scope.
- The UI gives feedback that the selected entry is the next card and normal
  training continues afterward.

## Validation

Run after implementation:

- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/WordDetailPanel.membership.test.tsx tests/useTrainingActiveList.test.tsx`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`
- `git diff --check`

## Progress

- 2026-05-25: Implementation completed.
- Renamed the internal forced-word path to next-card override semantics.
- Added visible training-screen and entry-detail feedback.
- Covered search-detail override behavior, active-scope non-mutation, and
  one-shot normal-training resume in `TrainingScreen.test.tsx`.
