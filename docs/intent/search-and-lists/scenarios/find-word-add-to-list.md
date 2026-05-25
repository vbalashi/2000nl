# Scenario: Find A Word And Add It To A List

Status: Draft
Primary role: Single-language learner
Secondary roles: Lookup-first user, List curator

## User Intent

When the user finds a useful dictionary entry, the user wants to add it to the
right list, so that it can be saved, reviewed, or trained later.

## Scope

In scope:

- Adding one selected dictionary entry to one list.
- Showing existing membership before add.
- Confirming the new membership after add.
- Creating a new user list inline when adding, because the current detail panel
  already supports that path.
- Allowing the user to continue lookup or open the target list.

Out of scope:

- Bulk adding multiple search results.
- Advanced list creation settings beyond name and optional description.
- Editing the dictionary content itself.

## Current UI Path

1. User opens `Zoeken`.
2. User searches and selects an entry.
3. The entry detail panel shows definition content and an `Acties` section.
4. The header may show `In lijsten: selected list`, but this is the current
   selected list context, not verified full membership for the entry.
5. User chooses an existing user list or selects `Nieuwe lijst aanmaken`.
6. User clicks `Toevoegen aan lijst`.
7. System calls the add-list action, reloads lists, and shows `Woord toegevoegd
   aan lijst.`

## Intended Product Flow

1. User selects an entry.
2. System shows current list membership for that entry.
3. User chooses a target user list that does not already contain the entry, or
   creates a new user list.
4. System adds the entry.
5. System shows the updated membership state.
6. User can continue searching, inspect the target list, or start training.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| See current membership | Ambiguous | Detail shows `In lijsten: selected list` but does not prove the entry belongs to that list or show all lists containing the entry. | Entry detail must show actual memberships for the selected entry before the add control. |
| Choose target list | Partly clear | The selector includes user lists and supports new-list creation, but it does not mark lists that already contain the entry or explain why curated lists are not add targets. | Target lists must show availability: already contains entry, can add, or read-only/not eligible. |
| Add entry | Clear for the happy path | The primary mutation exists and uses a clear button, but duplicate or already-member states are not prevented in the UI. | Add action must be disabled or relabeled when the entry is already in the target list. |
| Confirm new state | Ambiguous | Success message confirms an operation, but the visible membership state is not updated as first-class state in the panel. | After add, the membership section must update in place and include the target list. |
| Continue next action | Partly clear | The user can keep searching because the modal remains open, but there is no direct "open target list" affordance after add. | Success state should offer both continue lookup and open target list without requiring the user to reconstruct context. |

## Role Variants

| Role | Difference |
|---|---|
| Single-language learner | Most likely wants a default target such as the active learning list. |
| Lookup-first user | May want save action available but visually secondary. |
| List curator | May need faster repeated add and bulk workflows. |

## Open Questions

- Should adding to a list also start learning progress, or should list
  membership and training progress remain separate?
- Should the default target list be the active training list, the last used
  list, or no preselected list?
- Should duplicate adds be silently idempotent, blocked before submit, or shown
  as "already in list" state?
- Should newly created lists become the active training list, remain only a save
  target, or ask explicitly?

## Derived Requirements

- Entry detail needs a membership section backed by real entry-to-list state,
  not by the currently selected list name.
- Add-to-list controls should be driven by membership state: eligible lists,
  already-containing lists, and unavailable/read-only lists must look different.
- Add success must update the membership section in place and identify the list
  that changed.
- Creating a list inline is acceptable for this flow, but it must not silently
  change the active training list.
- The post-add state should include a direct route to the target list.
