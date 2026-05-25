# Search Lists Entry Membership Audit

## Goal

Run the final audit slice for the entry membership scenario: verify that a user
can open an entry and answer which learning lists contain it, which memberships
are curated/read-only or user-owned/editable, whether a membership is the active
training list, what dictionary source the entry came from, and whether adding to
a user list changes training scope.

## Source Documents

- `docs/intent/search-and-lists/scenarios/inspect-entry-membership.md`
- `docs/intent/search-and-lists/current-ux-gap-report.md`
- `docs/intent/search-and-lists/ux-review-response.md`
- `docs/exec-plans/active/search-lists-entry-membership-slice.md`
- `docs/exec-plans/active/search-lists-viewed-list-vs-training-scope.md`
- `docs/exec-plans/active/search-lists-lookup-scope-ux-slice.md`
- `docs/exec-plans/active/search-lists-train-one-entry-next-card.md`

## Audit Findings

- `WordDetailPanel` fetches real learning-list memberships with
  `fetchEntryListMemberships`; it no longer derives membership from the viewed
  or selected list name.
- Dictionary source is rendered separately as `Bron`, and the membership section
  is labeled `Opgeslagen in leerlijsten`.
- Empty membership state is explicit: `Nog niet opgeslagen in een leerlijst.`
- Curated memberships are labeled `Curated leerlijst` and `Alleen-lezen`.
- User-owned memberships are labeled `Mijn lijst` and `Bewerkbaar`.
- Add-to-list duplicate state is disabled and visible as `Staat al in lijst`.
- Add success refreshes membership state in place and calls the list reload hook.
- `WordDetailDrawer`, `Sidebar`, `DictionarySearchTab`, and `WordListTab` route
  through `WordDetailPanel`, so they share the same membership implementation.
- Passive viewed-list browsing, lookup filtering, and `Train dit woord` behavior
  are handled by the previous slices and were not changed.

## Implemented Changes

- Renamed the active-membership badge from `Actieve training` to `Actieve
  trainingslijst` so it clearly refers to list membership.
- Added save-action copy stating that adding an entry to a learning list does
  not change the active training list.
- Added focused `WordDetailPanel` test coverage for the new save-scope copy.
- Updated the UX gap report with post-slice status for the six starter
  scenarios.

## Deferred Product Gaps

- Opening a containing list directly from a membership row is still deferred
  until navigation can safely target viewed-list state from entry detail.
- Removing a user-owned membership from entry detail is still not implemented.
  The current detail panel identifies editable memberships and supports adding,
  but removal remains a future list-management action.
- Read-only curated membership copy is intentionally simple; richer copy or
  copy-to-user-list semantics need a product decision.

## Validation

- `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx tests/TrainingScreen.test.tsx tests/useTrainingActiveList.test.tsx`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`
- `git diff --check`

## Progress

- 2026-05-25: Audit completed and narrow copy gaps fixed.
