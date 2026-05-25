# Search Lists Lookup Scope UX Slice

## Goal

Implement the next narrow search/lists UX slice: make dictionary lookup, viewed-list
filtering, and list inspection visually and textually distinct without changing
entry membership, passive list browsing, or active training scope behavior.

Exact user outcome:

When a user opens `Zoeken`, the default search reads as a dictionary lookup over
the current language/source scope. If the user filters by the viewed list, the
UI names that as a viewed-list filter. When a user opens `Lijsten`, the word
surface names list contents as the viewed list's contents, not the dictionary
source or the active training list.

## Source Documents

- `docs/intent/search-and-lists/index.md`
- `docs/intent/search-and-lists/current-ux-gap-report.md`
- `docs/intent/search-and-lists/ux-review-response.md`
- `docs/intent/search-and-lists/scenarios/find-word-understand.md`
- `docs/exec-plans/active/search-lists-entry-membership-slice.md`
- `docs/exec-plans/active/search-lists-viewed-list-vs-training-scope.md`

## Product Semantics

- Dictionary lookup scope is not active training scope.
- Viewed list is navigation and filtering context only.
- Active training list is training configuration only.
- Global lookup searches accessible dictionary entries in the current
  language/source scope.
- List-filtered lookup is allowed, but it must be labeled as a viewed-list
  filter/discovery mode.
- List inspection answers "what is in this list?", not "what dictionary source
  am I using?"

## Implementation Scope

In scope:

- Update `DictionarySearchTab` scope chips, count text, empty states, and
  selected-detail state labeling.
- Update `WordsToolbar` title, scope copy, filter toggle, and input label so
  list content and dictionary lookup are distinct.
- Update `WordListTab` no-result states for viewed-list filter, empty viewed
  list, and dictionary lookup.
- Add focused tests in `TrainingScreen.test.tsx` for copy and preserved-detail
  behavior.

Out of scope:

- Train-this-word behavior changes.
- Training footer or effective-scope redesign.
- Bulk add from global search.
- DB/RPC changes.

## Acceptance Checks

- Global `Zoeken` reads as dictionary lookup, not active training list search.
- List-filtered search labels use viewed-list/filter language.
- `Lijsten` list contents are labeled as viewed-list/list contents.
- No search/list filter label says "active list" unless it truly means active
  training scope.
- Existing membership behavior remains intact.
- Passive list browsing still does not change active training scope.
- Tests cover the changed copy/state behavior.

## Validation

Run after implementation:

- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/WordDetailPanel.membership.test.tsx tests/useTrainingActiveList.test.tsx`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`
- `git diff --check`

## Progress

- 2026-05-25: Implementation completed.
- Updated `DictionarySearchTab` to label default search as `Woordenboeklookup`,
  viewed-list filtering as `Lijstfilter`, and preserved detail as an open entry
  when result sets change.
- Updated `WordsToolbar` and `WordListTab` copy so `Lijsten` distinguishes
  viewed-list contents from dictionary lookup and uses scope-specific no-result
  states.
- Added focused `TrainingScreen` coverage for dictionary scope copy,
  viewed-list filter empty state, dictionary empty state, and preserved open
  entry labeling.
- Validation passed:
  `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/WordDetailPanel.membership.test.tsx tests/useTrainingActiveList.test.tsx`,
  `cd apps/ui && npm run typecheck`, `cd apps/ui && npm run lint`, and
  `git diff --check`.
