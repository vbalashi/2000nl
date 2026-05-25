# Search Lists Entry Membership Slice

## Goal

Implement the first UX-approved search/lists fix: real entry membership and
add-to-list state in `WordDetailPanel`, with only the supporting scope-label
changes needed to prevent selected/viewed list context from being displayed as
membership.

Exact user outcome:

When a user opens an entry from search or from a list, they can tell whether the
entry is saved in learning lists, which memberships are editable or read-only,
what dictionary source the entry came from, and they can add the entry to an
eligible user-owned list without changing the active training scope.

## Source Documents

- `docs/intent/search-and-lists/index.md`
- `docs/intent/search-and-lists/current-ux-gap-report.md`
- `docs/intent/search-and-lists/ux-review-response.md`
- `docs/intent/search-and-lists/scenarios/find-word-add-to-list.md`
- `docs/intent/search-and-lists/scenarios/inspect-entry-membership.md`
- `docs/intent/search-and-lists/scenarios/find-word-understand.md`

## UX Review Decision

Status: approved with required changes.

Required product semantics for this slice:

- Dictionary source is metadata, not list membership.
- List membership means entry-to-learning-list relationship. It includes both
  curated learning lists and user-owned learning lists.
- Save/list membership and learning progress are independent.
- Viewed list is navigation context and must not change active training scope.
- Add-to-list must not create learning progress or change active training scope.
- Dictionary lookup must search accessible dictionary entries, not only entries
  that belong to a curated or user learning list.
- `Train dit woord` is not part of this implementation unless its product
  behavior is explicitly decided.

## Current Technical Context

Relevant UI:

- `apps/ui/components/training/WordDetailPanel.tsx`
  - Currently receives `selectedListName` and renders it as `In lijsten`.
  - Add-to-list supports existing user lists and inline new-list creation.
  - Success state is a message, not real membership refresh.
- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
  - Passes `selectedListName` into `WordDetailPanel`.
  - Global lookup can be toggled to `Alleen actieve lijst`.
- `apps/ui/components/training/wordlist/WordListTab.tsx`
  - Opens `WordDetailDrawer`.
  - Uses selected list/view state in ways that currently overlap with active
    training list state.
- `apps/ui/components/training/wordlist/WordDetailDrawer.tsx`
  - Wraps `WordDetailPanel`.
- `apps/ui/components/training/SettingsModal.tsx`
  - Owns selected list state for the modal and passes active-list-changing
    callbacks into list/search tabs.

Relevant services and contracts:

- `apps/ui/lib/training/listService.ts`
  - `fetchUserListMembership(listId, wordIds)` checks membership for selected
    ids in one user list.
  - `addWordsToUserList`, `removeWordsFromUserList`, and `createUserList`
    already exist.
- `db/migrations/059_security_harden_user_scoped_rpcs.sql`
  - `get_user_list_memberships_for_entries(p_user_id, p_entry_ids)` exists, but
    currently returns user-list memberships only.
  - This is not sufficient for the target UX. The implementation must expand
    or replace the contract so entry detail can show curated learning-list
    membership as read-only membership.
- `apps/ui/lib/platform/platformApi.ts`
  - Platform lookup already calls `get_user_list_memberships_for_entries` and
    maps membership payloads.
- `packages/shared/types/platform.ts`
  - `EntryListSummary` exists for platform payloads, but does not yet model UI
    editability or active-training-list status.

## Implementation Scope

In scope:

- Add a UI-facing entry membership service for one selected entry, backed by a
  real membership query that returns curated and user learning-list
  memberships.
- Render membership in `WordDetailPanel` from real data, not from
  `selectedListName`.
- Display dictionary source separately from learning-list membership.
- Show `not saved in any list` when no learning-list membership exists.
- Keep dictionary entries visible in global lookup even when they are not in
  any learning list, as long as the user can access the dictionary source.
- Mark target lists in the add selector as available or already containing the
  entry.
- Disable or relabel add action for duplicate target membership.
- Refresh membership in place after add or new-list-and-add.
- Keep inline simple user-list creation if it does not change active training
  scope.
- If opening a containing list is implemented in this slice, it must open the
  list as viewed-list context only and must not call the active-training-scope
  change path.

Out of scope:

- Full redesign of `SettingsModal`, `WordListTab`, or the training footer.
- Full single-entry training implementation.
- Bulk add from global search results.
- Advanced sorting or list-management expansion.
- Teacher/coach, sharing, export, classroom, or broad multi-language redesign.
- Automatically starting progress when saving to a list.

## Recommended Data Contract

Add an app-local UI type, or equivalent:

```ts
type EntryLearningListMembership = {
  listId: string;
  listType: "user" | "curated";
  name: string;
  description?: string | null;
  itemCount?: number;
  primaryLanguageCode?: string | null;
  editable: boolean;
  readOnlyReason?: "curated" | "not-owner" | "unavailable";
  isActiveTrainingList: boolean;
};
```

Dictionary source should be rendered from entry/source metadata separately and
must not be included in this membership array. If the current app-local
dictionary entry payload cannot provide human-readable dictionary metadata yet,
show the existing source label separately and avoid claiming it is a list.

The membership query must include curated learning lists. Curated memberships
are read-only membership rows, not add targets. User-owned memberships are
editable when the list belongs to the current user.

A dictionary entry may have:

- source metadata and no learning-list membership;
- source metadata plus curated learning-list membership;
- source metadata plus user-owned learning-list membership;
- source metadata plus both curated and user-owned learning-list membership.

All four states are valid. The first state must still be findable through
dictionary lookup.

## Implementation Steps

1. Add characterization tests before changing UI behavior.
   - Cover `WordDetailPanel` with no memberships.
   - Cover one editable user-list membership.
   - Cover one read-only curated-list membership.
   - Cover an entry that is in both a curated list and a user list.
   - Cover duplicate target-list add disabled/relabelled.
   - Cover add success refreshing visible membership state.
   - Cover dictionary source shown separately from membership.

2. Add a membership service in `apps/ui/lib/training/listService.ts`.
   - Prefer a bulk helper such as `fetchEntryListMemberships(entryIds)`.
   - Add or update a DB migration/RPC to return curated and user learning-list
     memberships together.
   - Rename the app-level helper away from `user list memberships` if it now
     returns all learning-list memberships.
   - Do not include dictionary source memberships in this contract.

3. Update `WordDetailPanel`.
   - Remove `selectedListName` as the source of `In lijsten`.
   - Fetch membership when `entry.id` changes.
   - Add loading, error, empty, and populated membership states.
   - Keep definition/examples/translation primary for lookup-first use.
   - Show add-to-list controls as membership-driven actions.
   - Do not record review/progress as part of add-to-list.

4. Update add-to-list behavior.
   - Target selector should distinguish:
     - eligible user list;
     - already contains entry;
     - unavailable/read-only if such rows are shown.
   - Add button should not submit a duplicate as if it were new.
   - After add succeeds, refresh membership and lists in place.
   - New list creation may remain, but the new list must not become active
     training scope automatically.

5. Update call sites.
   - `DictionarySearchTab` and `WordDetailDrawer` should stop passing selected
     list context as membership copy.
   - If a viewed-list label remains useful, label it as viewed/source context,
     not `In lijsten`.
   - Ensure opening details from `WordListTab` preserves list context without
     turning it into membership.

6. Optional containing-list navigation.
   - Only implement if it can open the list as viewed-list state without
     calling `onListChange` or `updateActiveList`.
   - If the current modal state cannot support that safely, leave the navigation
     affordance out and document it as deferred until viewed-list and active
     training scope are separated.

7. Keep `Train dit woord` separate.
   - Do not change its routing in this slice.
   - If the action remains visible in the edited panel, visually and textually
     separate it from membership/save actions.
   - Do not use this slice to implement quick-practice.

## Acceptance Checks

- An entry with no memberships shows `not saved in any list` or equivalent, not
  the currently selected/viewed list name.
- An entry in one user list shows that list as editable membership.
- An entry in one curated learning list shows that list as read-only membership.
- An entry in both curated and user lists shows both memberships with different
  editability.
- An entry that is in no learning list but exists in an accessible dictionary
  remains findable through global dictionary lookup.
- An entry already in the selected target list cannot be added again as if new.
- Adding to a user list updates the membership section without closing and
  reopening the panel.
- Dictionary source metadata is visible but never counted as `saved in lists`.
- Add-to-list does not change active training list.
- Creating a new list and adding the entry does not change active training list.
- Opening an entry from a list preserves viewed-list context but does not turn
  viewed-list context into membership.
- Membership fetch error shows a recoverable state and does not show stale
  selected-list membership.

## Validation

Run the narrowest relevant checks after implementation:

- `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx`
- `cd apps/ui && npm test -- tests/trainingService.listsPreferences.test.ts`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm run lint`

If a DB/RPC migration changes membership behavior, also run the relevant RPC
tests against a Supabase DB:

- `cd apps/ui && FSRS_TEST_DB_URL="$SUPABASE_DB_URL" npm test -- tests/fsrs/*.test.ts`

If visible layout changes are non-trivial, start the UI and smoke test search
and list detail with the browser:

- `cd apps/ui && npm run dev`

## Progress

- 2026-05-25: Implementation slice completed.
- Added real entry learning-list membership rendering in `WordDetailPanel`.
  Dictionary source is shown separately as `Bron`; selected/viewed list context
  is no longer used as membership.
- Added `EntryLearningListMembership` and `fetchEntryListMemberships`.
- Added migration `db/migrations/062_entry_learning_list_memberships.sql` to
  return curated read-only and user-owned learning-list memberships while
  excluding dictionary source lists such as full `VanDale`.
- Added focused membership tests for empty, loading/error retry, curated,
  user-owned, active-training-list, duplicate add, and add-refresh states.
- Validation reported by implementation agent:
  - `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx`
  - `cd apps/ui && npm test -- tests/trainingService.listsPreferences.test.ts`
  - `cd apps/ui && npm test -- tests/WordDetailPanel.translation.test.tsx`
  - `cd apps/ui && npm run typecheck`
  - `cd apps/ui && npm run lint`
  - `cd apps/ui && npm test -- tests/fsrs/fsrsRpc.test.ts` ran, but DB-backed
    tests were skipped because no `FSRS_TEST_DB_URL` or `SUPABASE_DB_URL` was
    set locally.
- 2026-05-25: Acceptance review reran:
  - `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx tests/trainingService.listsPreferences.test.ts`

## Agent Handoff Notes

- Start by reading the UX review response, especially `First Implementation
  Slice` and `Product Model Corrections`.
- Treat `selectedListName` in detail panels as suspect. It is context, not
  membership.
- Do not let convenience drive active-training-scope changes. The first slice
  should improve membership truthfulness even if list navigation has to be
  deferred.
- Do not implement a user-list-only membership slice. The product decision is
  that curated learning-list membership is real membership and should be shown
  as read-only.
- Keep the final implementation notes explicit about what membership states are
  supported and what remains deferred.
