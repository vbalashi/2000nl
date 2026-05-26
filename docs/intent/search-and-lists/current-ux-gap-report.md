# Search And Lists Current UX Gap Report

Last updated: 2026-05-25
Status: Post entry-membership audit slice

## Purpose

This report summarizes repeated gaps found across the six starter scenarios. It
is not a scenario file and not an implementation plan. Use it to choose the
first UI/product changes before opening an execution plan.

## Starter Scenario Status

| Scenario | Current status | Notes |
|---|---|---|
| Find word and add to list | Handled for the narrow single-entry path. | Entry detail shows real membership, blocks duplicate user-list adds, refreshes membership after add, and states that saving does not change active training scope. Bulk add and richer add-failure states remain deferred. |
| Find word and understand it | Handled for scope labeling. | `Zoeken` now presents dictionary lookup separately from viewed-list filtering, and source metadata is shown as `Bron`, not list membership. |
| Inspect entry membership | Mostly handled. | Detail surfaces share `WordDetailPanel`, which shows curated/read-only and user/editable memberships, active-training-list membership, source metadata, duplicate add state, and empty membership state. Direct open-containing-list and remove-from-entry-detail remain deferred product gaps. |
| Manage list words | Handled for the prior scope ambiguity. | `Lijsten` distinguishes viewed list from active training list, and passive list browsing no longer changes training scope. Broader create/rename/delete and advanced list-management states remain outside the starter slices. |
| Choose training scope | Handled for accidental-scope prevention and visibility. | Effective training scope is visible before training, and explicit training-scope actions remain separate from browsing/searching. Temporary train-this-list sessions are still not defined. |
| Train one entry now | Handled as a defined next-card override. | `Train dit woord hierna` makes the entry the next card once, closes lookup/list/settings if needed, then normal training resumes without changing active training list or membership. Returning to the originating lookup/list/settings surface is not part of the current flow. |

## Repeated Problems

| Problem | Where it repeats | Why it matters |
|---|---|---|
| Active training scope, viewed list, and search filter blur together. | Global search, list view, footer training controls, list settings. | Mostly addressed in the starter slices: passive browsing/filtering no longer changes training scope, and labels distinguish dictionary lookup, viewed list, and active training scope. |
| Entry membership is not first-class state. | Entry detail, add-to-list flow, membership inspection. | Addressed for entry detail: membership is fetched as actual curated/user learning-list state, with source metadata shown separately. |
| Mutations confirm operations, not the resulting object state. | Add to list, create list inline, copy/remove selected words. | Addressed for entry-detail add-to-list: successful adds refresh visible membership in place. Broader list mutation states remain deferred. |
| Single-entry training is behaviorally ambiguous. | Entry detail, search flow, list detail drawer, training queue. | Addressed for current behavior: `Train dit woord` is a one-shot next-card override and does not change active scope or membership. |
| List management and dictionary discovery share the same surface. | `Lijsten` word table and `Zoeken` list filter. | Addressed at copy/state level: dictionary lookup, viewed-list filtering, and list contents now use distinct labels. |
| Ownership/editability is implicit. | Curated lists, user lists, dictionary source lists, membership removal. | Partially addressed: entry memberships show curated/read-only versus user/editable, while remove-from-entry-detail and richer permission states remain deferred. |

## Must-Fix Requirements

- Define three separate scope concepts in UI copy and state: dictionary lookup
  scope, viewed list scope, and active training scope.
- Do not let passive list browsing or search filtering silently change the
  active training list.
- Add an entry membership section backed by actual entry-to-list data. Done for
  entry detail.
- Drive add/remove/copy list actions from membership and ownership state. Add is
  membership-driven; remove/copy detail actions remain deferred.
- After any list mutation, update the visible object state in place. Done for
  entry-detail add-to-list.
- Define the exact product behavior of `Train dit woord` before changing its UI
  label, placement, or routing. Done as one-shot next-card override.
- Show effective training scope before training: list, scenario, card filter,
  and any list card policy. Done for the current training surface.

## Can Defer

- Bulk add from global search results.
- Advanced list sorting beyond the first required dimensions.
- Teacher/coach sharing, export, or assignment flows.
- Personal overrides for curated list training settings.
- Multi-language scope redesign beyond making the current language/source scope
  explicit.
- Advanced inline list creation settings.

## First UI Zones To Change

1. `WordDetailPanel`
   Add real membership state, integrate add/remove actions with that state, and
   make `Train dit woord` behavior explicit.

2. `WordListTab`
   Separate viewed list from active training list. Replace implicit list-change
   side effects with an explicit "make active for training" action.

3. `DictionarySearchTab` and `WordsToolbar`
   Label global dictionary lookup, list-filtered lookup, and list inspection as
   distinct result scopes.

4. `FooterStats` and training settings
   Present the effective training scope as list + scenario + card filter instead
   of independent compact controls.

5. `TrainingScreen` single-entry flow
   Keep the forced-next-word behavior as the defined one-shot next-card override:
   insert the selected card once, record normal progress, then continue the
   existing training queue.

## Implementation Inputs Needed

- A UI-facing membership query for one or more entry ids, including curated and
  user learning-list memberships, list type, ownership, item count, and
  editability.
- Dictionary source must be source metadata, not membership.
- Global dictionary lookup must search accessible dictionary entries even when
  an entry is not present in any learning list.
- A product decision on whether `Train dit woord` is one-entry practice,
  next-card override, add-to-active-list, or a different action.
- A product decision on whether list-level `Trainingsinstellingen` are defaults,
  current-session overrides, or read-only list contract metadata.

## Suggested Execution Order

1. Lock the product semantics needed for implementation: dictionary source
   versus learning-list membership, membership versus progress, viewed list
   versus active training list, and the intended meaning of `Train dit woord`.
2. Implement entry detail membership and add-to-list behavior using real
   membership state. Do not populate membership from selected/viewed list
   context.
3. Remove passive viewed-list-to-active-training side effects in list
   management. Add an explicit `Make active for training` or equivalent action.
4. Clarify dictionary lookup scope versus list-filtered lookup/list inspection
   in `DictionarySearchTab`, `WordListTab`, and `WordsToolbar`.
5. Summarize effective training scope in the training surface: list, scenario,
   card filter, and list policy.
6. Implement the decided single-entry training behavior as a temporary one-entry
   session or clearly labeled next-card override.
7. Add the missing state tables and only then expand into advanced list
   management, bulk actions, sorting, and future role workflows.
