# UX Review Response: Search, Lists, And Training

## Decision

Approved with required changes.

The six starter scenarios are the right starting set for this product area. They cover the main path from dictionary lookup to entry detail, saving, membership inspection, list management, training-scope selection, and immediate practice. The set is not fully implementation-ready yet because several product terms still permit the current ambiguity to survive into the UI: `active list`, `source list`, `membership`, `saved`, `learned`, and `train this word` need stricter definitions. This is not blocked if the first implementation slice is narrow and proves real entry membership without changing training scope by accident.

## Coverage Verdict

- Covered well:
  - The six scenarios cover the right core flows: find meaning, save to list, inspect membership, manage a list, choose what to train, and train one entry.
  - The documents correctly identify the major product seam: dictionary lookup, viewed list, list membership, and active training scope are different concepts.
  - The current UX gap report correctly treats membership as state, not just an action.
  - The scenarios correctly call out that passive browsing must not mutate active training scope.
  - The role set is useful because it separates lookup-first use, card-training use, and list-curation use instead of compressing them into one generic learner.
  - The one-entry training scenario correctly identifies the highest-risk ambiguity: `Train dit woord` currently sounds like a clear action while its product behavior is not clear.

- Missing or underdefined:
  - A list/source taxonomy is needed before implementation: dictionary source, curated learning list, user-owned learning list, viewed list, active training list, and temporary training scope should not share the same mental bucket.
  - Empty, loading, error, duplicate, and unavailable states are underdefined across search, membership, list mutation, and training.
  - The state relationship between save/list membership and learning progress is not settled strongly enough. The safer model is that membership and progress are independent unless the user starts training or explicitly changes progress.
  - The scenario set does not yet cover create/rename/delete list management, empty first-run states, or `train this list` from a list view.
  - The dictionary lookup scope needs a small state table. Language/source scope, list filtering, and dictionary-source metadata are still close enough to be confused.
  - Single-entry training needs a product decision before UI routing changes, even if implementation comes later.

- Over-scoped or premature:
  - Advanced sorting is premature for the first UI fix. Define one or two minimum sort modes only if the first list-management slice needs them.
  - Inline list creation can stay in the happy path because it already exists, but advanced creation settings should wait.
  - Teacher/coach, sharing, export, classroom assignment, and broad multi-language scope redesign should remain out of scope.
  - Full single-entry training implementation can wait, but the product meaning of the action cannot wait if the entry detail UI is being changed.
  - Personal overrides for curated-list training settings should wait until the base training-scope model is stable.

## Scenario-by-scenario Feedback

### scenarios/find-word-add-to-list.md

- Keep:
  - Keep this as a primary starter scenario. It is central to the search/list/training product area.
  - Keep the focus on adding one selected dictionary entry to one list. This is the right first slice; bulk add should remain deferred.
  - Keep the requirement that current membership is shown before the add action.
  - Keep inline list creation as a supported path if the current UI already offers it, but treat it as a simple extension of add-to-list, not as a full list-creation workflow.
  - Keep the post-add requirement that the visible state changes in place. A toast alone is not enough.

- Change:
  - Replace “right list” with more explicit language: eligible user-owned learning list, existing user list, or newly created user list. Curated lists and dictionary sources should not look like normal add targets.
  - Make the default target-list rule explicit. Recommended rule: use the last manually chosen user list when available; otherwise use no preselected target. Do not silently default to active training list unless product explicitly wants “save for training” to be the dominant behavior.
  - State that adding to a list must not start learning progress and must not change active training scope. Those are separate user intentions.
  - Define duplicate behavior as a UI state before submit, not only as a backend/idempotency behavior. The list selector should show `Already in this list` and disable or relabel the add action.
  - Separate “new list created” from “new list made active for training.” Creating a save target should not change training scope.

- Missing:
  - Empty membership state: the entry is not saved in any learning list.
  - Source-only state: the entry has dictionary source metadata but no list membership.
  - Already-member state for one or more target lists.
  - Curated/read-only membership state.
  - Add failure and retry state.
  - Newly created list success state, including whether the entry was added to it.
  - Navigation after add: continue lookup, open target list, or stay on entry detail.

- Implementation blockers:
  - UI-facing membership data must exist before this is implemented: entry id, list id, list name, list type, ownership, editability, and whether the list is the active training list.
  - The team must decide that list membership and learning progress are separate. If not, add-to-list becomes a training-enrollment flow and the scenario needs to be rewritten.
  - Duplicate handling must be defined before engineering wires the selector state.

### scenarios/find-word-understand.md

- Keep:
  - Keep Lookup-first user as the primary role for this scenario. It prevents the entry detail surface from becoming dominated by saving and training controls.
  - Keep definition, examples, source, translation state, and meaning metadata as the primary content.
  - Keep the requirement that global lookup must remain fast and accessible outside list management.
  - Keep the note that repeated lookup needs predictable detail behavior when the query changes.

- Change:
  - Use `dictionary lookup scope` rather than `active search scope`. “Active” is already overloaded by active training list.
  - Treat language/source filters as dictionary lookup scope. Treat list filtering as a different mode or a visibly secondary filter, not as another dictionary source.
  - Add a rule for selected entry persistence when the query changes. Recommended rule: if the selected entry is not in the current result set, label it as `Previously selected` or clear selection; do not leave it looking like the selected result of the new query.
  - Clarify whether list-scoped search belongs inside global lookup. Recommended rule: global lookup defaults to dictionary scope; list filtering can be offered as an explicit filter state, but it must never look like the dictionary source or active training scope.
  - Keep membership visible but subordinate. For lookup-first users, the entry detail answer is “what does this mean?” before “where is it saved?”

- Missing:
  - No-result state for dictionary lookup.
  - Multiple meanings/homographs from different sources.
  - Phrase query versus single-word query behavior.
  - Translation loading failure or unavailable translation state.
  - Entry not trainable or not eligible for a selected training scenario.
  - Dictionary source metadata that is not list membership.
  - Remembered source/language filter behavior across sessions.

- Implementation blockers:
  - The default dictionary lookup scope must be decided before changing search copy or controls. Recommended default: all accessible dictionary entries within the current language/source filter, not the active training list.
  - The product must decide whether list-filtered lookup stays in the global search surface or moves to list management. Either can work, but the labels and state model differ.
  - Entry detail membership must be real membership data or omitted from this scenario. Showing selected list context as `In lijsten` is not acceptable.

### scenarios/manage-list-words.md

- Keep:
  - Keep this as a separate scenario from dictionary lookup. It answers “what is in this list?” rather than “what dictionary entries match this query?”
  - Keep List curator as the primary role. This is the scenario where filtering, sorting, selection, and editability matter most.
  - Keep the explicit requirement that viewed list and active training list are separate states.
  - Keep the requirement that opening entry detail from a list preserves list context while still showing real entry membership.

- Change:
  - Split `search within this list` from `discover dictionary entries to add to this list`. The current “show all words” behavior sounds like a discovery/add mode and should not be treated as ordinary list inspection.
  - Replace generic “selected list” language with `viewed list` wherever the user is inspecting list contents.
  - Define the minimum list metadata needed in the header: list name, list type, owner/editability, word count, and whether it is currently active for training.
  - Do not make advanced sort a blocker. For the first list-management pass, a stable default order plus one explicit sort may be enough.
  - State selection behavior across filters/pages. A list curator will need to know whether selected rows remain selected when filters change.

- Missing:
  - Empty user-owned list state.
  - Curated/read-only list state.
  - User list with duplicate attempted add.
  - Remove/copy success state that updates visible row membership/counts.
  - Selected rows across pagination/filter changes.
  - Deleted or unavailable list while viewing.
  - `Train this list` from a list view: temporary session versus set as active training list.
  - Create, rename, delete, and duplicate list scenarios. These can be separate files, not embedded here.

- Implementation blockers:
  - Passive list selection must not change active training scope. This is a true blocker because otherwise list management continues to mutate training behavior.
  - The toolbar needs a clear scope model before it is changed: inside viewed list, outside viewed list, or all dictionary entries.
  - Action availability must be driven by ownership/editability and membership state, not by incidental button visibility.

### scenarios/choose-training-scope.md

- Keep:
  - Keep Card-training user as the primary role. The scenario is about reducing accidental training setup, not about list management.
  - Keep the model that effective training scope includes list, scenario, card filter, and list card policy.
  - Keep the requirement that passive list browsing and search filtering must not change active training scope.
  - Keep the option for a list view to offer `Train this list`, provided the behavior is explicit.

- Change:
  - Define whether active training scope is persistent app state, staged session state, or both. Recommended model: persistent default training scope exists, and temporary session overrides can be explicit one-off actions.
  - Avoid over-confirming every training start. Card-training users need clarity, but they also need low friction. A clear pre-start summary with an explicit change action is better than a confirmation step every time.
  - Clarify `resume` versus `start new session`. If the app continuously loads the next card, the product still needs a visible statement of the effective scope used for the next card.
  - Treat list-level `Trainingsinstellingen` as either list defaults, current-session overrides, or read-only list policy. Do not let them be all three.
  - Include due/new/available counts in the effective scope summary if the data is available. Counts are the fastest way to make scope real.

- Missing:
  - No active training list state.
  - Active list has zero trainable cards.
  - Active list has no due cards but has new cards.
  - Scenario/card filter returns no cards.
  - Active list deleted or no longer available.
  - Temporary `train this list` session from list view.
  - Training from a dictionary entry that is not a member of the active list.

- Implementation blockers:
  - The active training scope object must be defined before this UI is implemented: list, scenario, card filter, and list-level policy.
  - The team must decide whether footer/list changes apply immediately or are staged until the user starts/resumes training.
  - List-level training settings must have one meaning before they are surfaced as part of effective scope.

### scenarios/train-one-entry-now.md

- Keep:
  - Keep this as its own scenario. It is not a variant of normal training scope.
  - Keep the direct action from entry detail. The action is valuable when the user has immediate interest in a word.
  - Keep the requirement that single-entry training must not silently add membership or change active training scope.
  - Keep visible failure/fallback handling as a requirement.

- Change:
  - Decide the behavior before changing the UI. Recommended behavior: `Train this entry now` starts a temporary one-entry quick-practice session, records normal progress for the reviewed card, does not add the entry to any list, does not change active training scope, and returns the user to the originating context after completion.
  - If the current product chooses forced-next-card behavior instead, rename it accordingly, such as `Review this next`, and make clear that normal queue behavior continues after the card.
  - Do not use “first enabled mode” as an invisible rule. Choose a visible default, use the active scenario default, or ask only when necessary.
  - Define whether already-learned or ignored entries can be quick-practiced.
  - Define completion behavior: return to entry detail, continue normal training, or offer both as explicit choices.

- Missing:
  - Entry cannot be loaded.
  - Entry has no supported card type.
  - No training mode is enabled.
  - Entry is already learned, ignored, suspended, or not due.
  - User has no active training list, but wants to quick-practice one entry.
  - User cancels before answering.
  - User completes the one-entry session and chooses what to do next.
  - Progress is recorded for an entry that is not saved in any list.

- Implementation blockers:
  - The team must choose between temporary one-entry session, next-card override, add-to-active-list, or another behavior before implementation.
  - Card-mode selection must be defined. Invisible “first enabled mode” will create confusing outcomes.
  - Return-to-context behavior must be part of the implementation, not a later enhancement, if the action is called `Train this entry now`.

### scenarios/inspect-entry-membership.md

- Keep:
  - Keep this scenario. It is the clearest articulation of the product model correction needed in entry detail.
  - Keep membership as a first-class state, not a post-action confirmation.
  - Keep the requirement that containing lists are navigable without changing active training scope.
  - Keep the distinction between user-owned editable memberships and curated/read-only memberships.

- Change:
  - Do not treat dictionary source as list membership. Dictionary source is source metadata or source coverage. It can be displayed near membership, but it should not be under `In lijsten`.
  - Rename `In lijsten` if it includes only learning lists. Suggested English model: `Saved in lists`; Dutch equivalent should avoid implying dictionary source membership.
  - Show active training list as a status on a learning-list membership only when the entry is actually in that list. Do not imply that active training scope itself is membership.
  - Add a `not saved in any list` state. This is essential for lookup-first and single-language learner clarity.
  - Separate progress state from membership state. `Learned`, `due`, `new`, or `ignored` should not be inferred from whether the entry is saved.

- Missing:
  - Full membership state table for source-only, no learning list, curated list, user list, multiple lists, active-training-list membership, and read-only membership.
  - Entry belongs to a curated list and a user list at the same time.
  - Entry source exists in multiple dictionary sources.
  - User lacks permission to edit a membership.
  - Containing list is deleted, archived, or unavailable.
  - Remove from user-owned list and undo behavior.

- Implementation blockers:
  - A membership query contract is required before implementation.
  - Dictionary source versus learning-list membership must be settled before labels are changed.
  - Curated list behavior must be defined: read-only membership, copy-to-user-list, or some other model.

## Missing Scenarios Or States

Add these before broad design or engineering starts. They do not all need to block the first narrow implementation slice.

- `scenarios/create-manage-user-list.md`: create, rename, describe, delete/archive, and empty-list handling for user-owned lists.
- `scenarios/discover-entries-for-list.md`: user is inside a list and wants to find dictionary entries outside the list to add. This should be separate from inspecting entries already in the list.
- `scenarios/train-this-list.md`: user is viewing a list and wants to train it now. This must distinguish temporary session from changing persistent active training list.
- `scenarios/review-progress-state.md`: user sees whether an entry is new, learning, due, learned, ignored, or unscheduled, independent from list membership.
- `state-tables/entry-membership-states.md`: no membership, source-only, curated membership, user-owned membership, multiple memberships, read-only membership, active-training-list membership, deleted/unavailable list.
- `state-tables/search-scope-states.md`: global dictionary lookup, language/source filtered lookup, list-filtered lookup, no results, stale selected entry, previous selection preserved.
- `state-tables/training-scope-states.md`: active list, temporary list session, one-entry session, scenario, card filter, zero due cards, zero trainable cards, deleted active list.
- `state-tables/list-mutation-states.md`: add, remove, copy, duplicate, partial failure, undo, and post-mutation visible state.
- First-run states: no user lists, no active training list, empty user list, curated-only user, and user who only looks up words.
- Error/loading states for membership fetch, translation loading, search results, and training-card fetch.

## Product Model Corrections

Dictionary source versus list membership:

A dictionary source is not a list membership. It answers “where did this lexical entry come from?” A learning list membership answers “has this user/app collection included this entry for saving, browsing, or training?” Source metadata can sit near membership, but it should use different labels, different visual treatment, and different data contracts. Dictionary source lists such as VanDale-style sources should not populate `In lijsten`.

Viewed list versus active training list:

A viewed list is navigation context. It answers “which list am I inspecting?” Active training list is training configuration. It answers “which list will normal training draw from by default?” Selecting a list in `Lijsten` should only change viewed list. Changing active training list should require an explicit training-scope action such as `Use this list for training` or `Make active for training`.

Save/list membership versus learning progress:

Saving an entry to a list should create or remove membership only. It should not automatically mean the entry is new, due, learned, or scheduled unless the product explicitly defines that enrollment behavior. Learning progress belongs to card/progress state. Membership can influence what is eligible for training, but it is not progress.

One-entry training versus normal training queue:

One-entry training should be a temporary session or a clearly labeled next-card override. It should not silently change active training list, add list membership, or look like normal queue progress if it does something different. The recommended model is a temporary quick-practice session that records progress for that card, returns to the previous context, and then lets the user choose whether to continue normal training.

Curated lists, user-owned lists, and dictionary source lists:

Curated lists are app-owned learning collections. They may be trainable and browsable but should be read-only unless copied or extended into user-owned lists. User-owned lists are editable collections controlled by the user. Dictionary source lists are not user-facing learning lists; they are source metadata unless the product intentionally creates a separate “source collection” browsing mode.

## Open Questions And Recommendations

| Question | Recommendation | Must answer before implementation? |
|---|---|---|
| What exactly counts as list membership? | Define membership as an entry-to-learning-list relationship only. Dictionary source should be source metadata, not membership. | Yes |
| Which list types exist in the UI model? | Use at least: user-owned learning list, curated/read-only learning list, dictionary source, viewed list state, active training scope. Do not collapse them under “list.” | Yes |
| Does adding an entry to a list start learning progress? | No. Add creates membership only. Progress starts through training or an explicit progress action. | Yes |
| Can curated list membership be removed? | Treat curated memberships as read-only. Offer copy/save to a user-owned list when the user wants control. | Yes |
| What is the default target list when adding from entry detail? | Prefer last manually chosen user list, otherwise no preselected list. Do not silently use active training list unless the product wants save-to-train as the default mental model. | No |
| How are duplicate adds handled? | Show `Already in this list` before submit; make the backend idempotent as a safety net. | Yes |
| Should newly created lists become active for training? | No. Creating a list should not change training scope. Offer a separate explicit action. | Yes |
| What is the default dictionary lookup scope? | Search all accessible dictionary entries within explicit language/source filters. Do not default to active training list. | Yes |
| Should list-filtered lookup live inside global search? | It can, but it must be labeled as a list filter/discovery mode, not as dictionary source or training scope. | No |
| What happens to selected entry detail when the query changes? | Either clear selection or label preserved detail as previously selected if it no longer belongs to the current result set. | Yes |
| Does viewing a list change the active training list? | No. Viewing is passive. Active training changes require an explicit action. | Yes |
| Is `Train this list` temporary or persistent? | Offer temporary `Train this list now` as the low-risk action; offer `Make active for training` as a separate persistent action. | Yes, if adding list-level training entry points |
| What is the active training scope object? | Define it as list + scenario + card filter + list card policy, with visible due/new/available counts when possible. | Yes |
| Are footer training changes immediate or staged? | Prefer explicit apply/start behavior for scope changes that affect the next card; avoid passive list-browsing side effects. | Yes |
| What does `Train dit woord` mean? | Recommended: temporary one-entry quick-practice session; no list membership change; no active-scope change; progress can be recorded; return to origin. | Yes |
| Which card mode is used for one-entry training? | Use the active scenario default or a dedicated quick-practice default; do not silently use the first enabled mode. | Yes |
| What happens when single-entry training fails to load the entry? | Show failure and keep the user in context. Do not silently fall back to normal queue while implying success. | Yes |
| Which sorting dimensions are required for list management? | Defer advanced sorting. Start with a stable default order and one explicit sort only if needed for the first list slice. | No |
| Are multi-language workflows in scope now? | Defer broad redesign, but keep language/source labels explicit so current work does not block multi-language later. | No |
| Are teacher/coach workflows in scope now? | Defer. Do not let future sharing or assignment needs distort the solo learner model. | No |

## First Implementation Slice

Recommended first slice: implement real entry membership and add-to-list state in `WordDetailPanel`, with minimal supporting scope-label changes in search/list contexts.

Exact user outcome to prove: when a user opens an entry from search or from a list, they can tell whether the entry is saved in any learning list, which memberships are editable, which are read-only, what dictionary source the entry came from, and they can add the entry to an eligible user-owned list without changing the active training scope.

The slice should include:

- A UI-facing membership query for a selected entry: list id, list name, list type, owner/editability, membership status, and active-training-list flag if relevant.
- Dictionary source displayed separately from list membership.
- A `not saved in any list` state.
- Target-list availability in the add control: can add, already contains, read-only/ineligible.
- Add success that updates membership in place.
- Duplicate prevention in the UI, with backend idempotency as a safety net.
- Inline creation of a simple user list only if it can be done without changing active training scope.
- A direct route from membership to open the containing list as viewed list only.
- No passive mutation of active training scope when the user opens an entry, opens a containing list, or filters search results.

Do not include full one-entry training in this first slice unless the product decision is already made. If the entry detail panel must retain the training action, label it according to its actual current behavior or visually separate it from membership until the one-entry training model is finalized.

Acceptance checks:

- An entry with no memberships shows no saved-learning-list membership, not the currently selected list name.
- An entry in one user list shows that list and allows removal if removal is in scope.
- An entry in a curated list shows read-only membership or copy/save semantics.
- An entry already in the selected target list cannot be added again as if new.
- Adding to a user list updates the membership section without requiring the user to close/reopen the panel.
- Opening a containing list changes viewed-list context only; the active training list remains unchanged.
- Dictionary source metadata is visible but never counted as `saved in lists`.

## Optional Rewrites

### `materials/index.md` — replace `## Core Objects`

```md
## Core Objects

| Object | Product meaning | User-facing questions |
|---|---|---|
| Dictionary entry | A source-backed lexical or meaning-level entry. | What does this word mean? Which source describes it? |
| Dictionary source | The reference/source that provides or classifies an entry. This is metadata, not learning-list membership. | Where did this entry come from? |
| Learning list | A curated or user-owned collection of entries used for saving, browsing, or training eligibility. | What words are in this list? Can I browse, save, copy, remove, or train them? |
| List membership | The relationship between an entry and a learning list. | Is this entry saved in any learning list? Which memberships can I change? |
| Viewed list | The list currently being inspected in the list UI. This is navigation context. | Which list am I looking at right now? |
| Active training scope | The persistent default training configuration: list, scenario, card filter, and list card policy. | What will normal training use next? |
| Temporary training scope | A one-off session scope such as one-entry practice or train-this-list-now. | What am I training just this time? |
| Card/progress state | The user's learning state for an entry/card type. | Is this new, learning, due, learned, ignored, or unavailable? |
```

### `materials/current-ux-gap-report.md` — replace `## Suggested Execution Order`

```md
## Suggested Execution Order

1. Lock the product semantics needed for implementation: dictionary source versus learning-list membership, membership versus progress, viewed list versus active training list, and the intended meaning of `Train dit woord`.
2. Implement entry detail membership and add-to-list behavior using real membership state. Do not populate membership from selected/viewed list context.
3. Remove passive viewed-list-to-active-training side effects in list management. Add an explicit `Make active for training` or equivalent action.
4. Clarify dictionary lookup scope versus list-filtered lookup/list inspection in `DictionarySearchTab`, `WordListTab`, and `WordsToolbar`.
5. Summarize effective training scope in the training surface: list, scenario, card filter, and list policy.
6. Implement the decided single-entry training behavior as a temporary one-entry session or clearly labeled next-card override.
7. Add the missing state tables and only then expand into advanced list management, bulk actions, sorting, and future role workflows.
```

### `materials/scenarios/train-one-entry-now.md` — replace `## Derived Requirements`

```md
## Derived Requirements

- `Train dit woord` must have one defined product meaning before UI routing changes.
- Recommended meaning: start a temporary one-entry quick-practice session for the selected entry.
- One-entry quick practice must not add list membership, remove list membership, or change active training scope.
- One-entry quick practice may record normal card progress if the selected entry/card type is trainable.
- The card mode must be explicit: active scenario default, dedicated quick-practice mode, or a visible user choice when needed.
- If the selected entry cannot be trained, the system must show the failure and return to the originating context rather than silently falling back to the normal queue.
- Completion must return to the originating entry context or present explicit next actions: continue normal training, save to list, or go back.
```
