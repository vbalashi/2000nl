# Scenario: Inspect And Manage A List's Words

Status: Draft
Primary role: List curator
Secondary roles: Single-language learner, Card-training user

## User Intent

When the user opens a word list, the user wants to inspect, search, filter, sort,
select, add, or remove entries within that list, so that the list remains useful
for learning or training.

## Scope

In scope:

- Selecting a list.
- Viewing list metadata and word count.
- Searching/filtering within the selected list.
- Sorting list entries.
- Selecting entries for list-level actions.
- Opening entry detail from the list without losing list context.

Out of scope:

- Teacher/student sharing.
- Advanced import/export workflows.
- Reordering curated list source order unless explicitly supported.

## Current UI Path

1. User opens `Lijsten`.
2. User selects or sees a list in the side list picker.
3. User opens the list's `Woorden` tab.
4. User uses search, part-of-speech filter, filters, pagination, or row
   selection.
5. User can open an entry detail drawer, copy selected words to another list,
   add selected words to the current user list, or remove selected words from
   the current user list.
6. Selecting a list also calls the app-level list-change handler, which means
   list inspection and active training list selection currently overlap.

## Intended Product Flow

1. User selects a list to inspect.
2. System keeps the selected list scope visible.
3. User searches, filters, sorts, or pages through entries in that list.
4. User selects an entry to inspect or manage.
5. System preserves list context after entry inspection.
6. User performs allowed list actions and sees updated list state.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| Select list scope | Ambiguous | The list picker, `Actieve trainingslijst` card, and selected list state are tied together, so viewing a list can look like changing training scope. | Viewed list and active training list must be separate states unless the user explicitly chooses "make active". |
| Search inside list | Mostly clear | `Filter actief` / `Filter door lijst` supports list-scoped search, but disabling it turns the list view into global search while the header still names the selected list. | The toolbar must clearly state whether results are inside the list or global results shown near a list. |
| Filter/sort list | Partial | Filters and pagination exist; sorting is not exposed in the current list table. | Define and expose the first required sort dimensions before treating list management as complete. |
| Open entry detail | Mostly clear | Rows and mobile list items open the detail drawer without leaving the list tab. | Detail drawer should preserve list context while still showing real entry membership. |
| Perform list action | Partial | User lists support add/remove/copy actions; curated lists are read-only; bulk copy exists. | Action availability must be explained by ownership and membership state, not only by which buttons happen to appear. |

## Role Variants

| Role | Difference |
|---|---|
| List curator | Needs efficient filtering, sorting, selection, and membership edits. |
| Single-language learner | Needs simple list inspection without administrative complexity. |
| Card-training user | Mostly needs to verify what will be trained. |

## Open Questions

- Which sort dimensions are required first: headword, part of speech, source,
  date added, progress state, due state, or list order?
- Should list search reuse global search behavior or remain strictly scoped to
  the selected list?
- Should selecting a list in `Lijsten` change the persistent active training
  list, or only change the viewed list?
- Should "show all words" inside list management be a discovery/add mode with a
  different label than list inspection?

## Derived Requirements

- List inspection needs a dedicated viewed-list state that does not silently
  update the active training list.
- The words toolbar must show the result scope in plain terms: in this list,
  outside this list, or all dictionary entries.
- User-owned list actions must distinguish add, remove, copy, and duplicate
  states.
- Curated/read-only list behavior must be explicit.
- Sorting requirements should be decided before redesigning the list table.
