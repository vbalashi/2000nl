# Scenario: Inspect Which Lists Contain An Entry

Status: Draft
Primary role: List curator
Secondary roles: Single-language learner, Lookup-first user

## User Intent

When the user is looking at a dictionary entry, the user wants to know which
lists already contain it, so that they can avoid duplicates, understand its
learning context, or change its membership.

## Scope

In scope:

- Showing all current memberships for a selected entry.
- Opening a containing list from entry detail.
- Adding or removing membership when allowed.

Out of scope:

- Cross-user sharing or classroom membership.
- Editing curated list definitions if the product treats curated lists as
  read-only.

## Current UI Path

1. User selects an entry in search.
2. The detail header may show `In lijsten: selected list`.
3. User can choose a user list target in the `Acties` section and add the entry.
4. In the list view, selected rows can be checked against the currently selected
   user list for add/remove actions.
5. The active training UI does not expose a full "all lists containing this
   entry" answer in entry detail.

## Intended Product Flow

1. User opens entry detail.
2. System shows current list membership as state.
3. User can open a listed list.
4. User can add the entry to another list if allowed.
5. User can remove the entry from a user-owned list if allowed.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| See membership | Ambiguous | `In lijsten` displays selected list context, not verified all-list membership for the entry. | Entry detail must fetch and render actual memberships for the selected entry. |
| Understand list type | Missing | The detail panel does not distinguish curated membership, user-owned membership, dictionary source membership, or active training list. | Membership rows/badges must show list type and whether the membership is editable. |
| Open containing list | Missing | Containing lists are not shown as navigable objects in entry detail. | Each membership should be linkable to its list without changing training scope unless the user explicitly asks. |
| Add another membership | Partial | Add-to-user-list exists, including inline new-list creation. | Add control should be integrated with membership state and exclude/mark existing memberships. |
| Remove membership | Missing in entry detail | Remove exists for selected rows in a user list, but not as an entry-detail membership action. | User-owned memberships should be removable from entry detail when allowed; curated memberships should be read-only or explain copy semantics. |

## Role Variants

| Role | Difference |
|---|---|
| Single-language learner | Needs a simple answer: saved or not saved, and where. |
| List curator | Needs editable membership and list ownership clarity. |
| Lookup-first user | Needs membership visible but not dominant. |

## Open Questions

- Should curated list membership be removable, hidden behind copy semantics, or
  read-only?
- Should list membership be shown as a compact summary or as an editable control?
- Should dictionary source membership, such as a VanDale source list, be shown
  alongside learning lists or treated as source metadata?
- Should active training list be highlighted inside membership, or should it
  remain a separate training-scope concept?

## Derived Requirements

- Entry membership needs its own UI model: list id, name, type, ownership,
  editable state, and active-training relationship if relevant.
- `In lijsten` must not be populated from the currently selected list name.
- Entry detail should support open-list, add-to-list, and remove-from-user-list
  from the same membership section.
- Curated/read-only memberships must be visibly different from editable user
  memberships.
- Membership inspection should remain useful for lookup-first users without
  making list management dominate the definition.
