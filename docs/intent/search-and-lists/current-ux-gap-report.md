# Search And Lists Current UX Gap Report

Last updated: 2026-05-25
Status: Draft

## Purpose

This report summarizes repeated gaps found across the six starter scenarios. It
is not a scenario file and not an implementation plan. Use it to choose the
first UI/product changes before opening an execution plan.

## Repeated Problems

| Problem | Where it repeats | Why it matters |
|---|---|---|
| Active training scope, viewed list, and search filter blur together. | Global search, list view, footer training controls, list settings. | Users can think they are only browsing or filtering when they may be changing what training uses next. |
| Entry membership is not first-class state. | Entry detail, add-to-list flow, membership inspection. | `In lijsten` can show selected context rather than all actual memberships, so the user cannot trust it as saved/list state. |
| Mutations confirm operations, not the resulting object state. | Add to list, create list inline, copy/remove selected words. | A success toast/message is weaker than showing the changed list membership or list contents. |
| Single-entry training is behaviorally ambiguous. | Entry detail, search flow, list detail drawer, training queue. | `Train dit woord` may mean one-entry practice, next-card override, list enrollment, or active-scope change. |
| List management and dictionary discovery share the same surface. | `Lijsten` word table and `Zoeken` list filter. | The same controls can answer different questions: "what is in this list?" versus "what dictionary entries match this query?" |
| Ownership/editability is implicit. | Curated lists, user lists, dictionary source lists, membership removal. | Users need to know why some memberships can be changed and others are read-only. |

## Must-Fix Requirements

- Define three separate scope concepts in UI copy and state: dictionary lookup
  scope, viewed list scope, and active training scope.
- Do not let passive list browsing or search filtering silently change the
  active training list.
- Add an entry membership section backed by actual entry-to-list data.
- Drive add/remove/copy list actions from membership and ownership state.
- After any list mutation, update the visible object state in place.
- Define the exact product behavior of `Train dit woord` before changing its UI
  label, placement, or routing.
- Show effective training scope before training: list, scenario, card filter,
  and any list card policy.

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
   Turn the forced-next-word behavior into a defined product flow: temporary
   one-entry session, next-card override, or another explicit behavior.

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
