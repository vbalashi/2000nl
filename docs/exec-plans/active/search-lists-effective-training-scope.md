# Search Lists Effective Training Scope

## Goal

Implement the next UX slice for search/lists/training: make the effective
normal-training scope explicit in the training UI.

Exact user outcome:

When a user is on the training surface, they can see the active training list,
active scenario, selected card filter, and available list-level training
policy/defaults together. The footer list selector remains an explicit control
for changing normal training scope. Viewed-list browsing and dictionary lookup
scope remain separate.

## Source Documents

- `docs/intent/search-and-lists/current-ux-gap-report.md`
- `docs/intent/search-and-lists/ux-review-response.md`
- `docs/intent/search-and-lists/scenarios/choose-training-scope.md`
- `docs/exec-plans/active/search-lists-entry-membership-slice.md`
- `docs/exec-plans/active/search-lists-viewed-list-vs-training-scope.md`
- `docs/exec-plans/active/search-lists-lookup-scope-ux-slice.md`

## Product Semantics

- Active training scope means what normal training will use next.
- Viewed list is navigation/list-inspection context, not training scope.
- Dictionary lookup scope is not training scope.
- Effective training scope is the active list, active scenario, card filter,
  and any list card policy/defaults available on the active list.
- This slice is display-only. It does not implement `Train dit woord`, quick
  practice, or one-entry training behavior.

## Implementation Scope

In scope:

- Audit `FooterStats`, `TrainingScreen`, `SettingsModal`, and the active-list
  hook for scope data already available in the UI.
- Add a compact effective training scope summary to the training footer.
- Repeat the same summary in the settings training section.
- Surface active-list `default_scenario_id`, `card_policy`, and
  `card_type_ids` when already available on `activeList`.
- Clarify that the footer list selector changes normal training scope.
- Add focused `TrainingScreen` coverage for the new summary and for viewed-list
  browsing not changing that summary.

Out of scope:

- DB/RPC changes.
- New active-scope persistence contracts.
- Redesigning training flow.
- Single-entry or `Train dit woord` behavior changes.
- Quick-practice or temporary list sessions.

## Acceptance Checks

- User can see what normal training is currently scoped to without opening list
  management.
- Active list, scenario, and card filter are shown together as one effective
  scope.
- Copy does not imply viewed list or dictionary lookup scope.
- Footer list selector remains an explicit training-scope control.
- Passive list browsing still does not change active training scope.
- Existing membership and lookup-scope tests still pass.
- No `Train dit woord` behavior changes.

## Validation

Run after implementation:

- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/WordDetailPanel.membership.test.tsx tests/useTrainingActiveList.test.tsx`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`
- `git diff --check`

## Progress

- 2026-05-25: Implementation completed.
- Added a shared effective training scope summary for the footer and settings
  training section.
- The summary shows active training list, active scenario, card filter, and
  active-list policy/defaults when the active list exposes them.
- Footer copy now states that the footer list selector changes normal training
  scope.
- Added focused `TrainingScreen` coverage for the summary and for viewed-list
  browsing not changing the active training scope summary.
- Validation passed:
  `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/WordDetailPanel.membership.test.tsx tests/useTrainingActiveList.test.tsx`,
  `cd apps/ui && npm run typecheck`, `cd apps/ui && npm run lint`, and
  `git diff --check`.
