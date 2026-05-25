# Scenario: Find A Word And Understand It

Status: Draft
Primary role: Lookup-first user
Secondary roles: Single-language learner, Multi-language learner

## User Intent

When the user encounters an unknown word or phrase, the user wants to find the
right dictionary entry, definition, examples, translation context, and source,
so that they can understand the word before deciding whether to save or train it.

## Scope

In scope:

- Global dictionary lookup.
- Selecting one entry/meaning from search results.
- Inspecting definition, examples, source, translation, list membership, and
  training-related state.
- Continuing to search without losing the selected entry context.

Out of scope:

- Editing dictionary entries.
- Creating new user-owned dictionary entries.
- Bulk list management.

## Current UI Path

1. User opens `Zoeken`.
2. User enters a word or phrase in `Zoek een woord of zin...`.
3. System shows result cards with headword, part of speech, source, meaning
   label, and a short definition preview.
4. Search scope chips show language and source, and an `Alleen actieve lijst`
   toggle can switch the query to the selected list.
5. User selects an entry.
6. The detail panel shows definitions, examples, optional translation loading,
   and entry actions.
7. The detail panel may show `In lijsten: selected list`, but this is not a
   reliable answer to "which lists contain this entry?"

## Intended Product Flow

1. User opens global dictionary search.
2. User enters a word or phrase.
3. System clearly states the active search scope.
4. System shows matching entries and meaning/source metadata.
5. User selects an entry.
6. System shows definition, examples, translation state, source, list
   membership, and training state/actions.
7. User can continue lookup, add to a list, or start a training-related action.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| Open global lookup | Clear | Header search button and `S` hotkey open the search tab directly. | Keep a fast global lookup entry point outside list management. |
| Understand search scope | Ambiguous | `Taal` and `Bron` are visible, but the `Alleen actieve lijst` toggle makes the same surface alternate between dictionary lookup and list-scoped filtering. | Search must state whether it is searching the dictionary source or a selected list. |
| Select entry/meaning | Mostly clear | Results expose headword, part of speech, source, meaning label, and definition preview. | Preserve source and meaning metadata in the result list. |
| Read entry detail | Mostly clear | Definitions, examples, translation, source badges, and actions are available, but membership is not actual all-list state. | Definition and examples stay primary; membership and training actions are visible but secondary for lookup-first use. |
| Continue lookup | Ambiguous | The selected detail can remain while the query/results change, so the detail may no longer obviously belong to the current result set. | When results change, the detail panel must either select a result from the new set or clearly show that the old entry is being preserved. |

## Role Variants

| Role | Difference |
|---|---|
| Single-language learner | May want save/train actions close to the definition. |
| Lookup-first user | Needs definition and examples to remain primary, with training actions secondary. |
| Multi-language learner | Needs language/source scope to be explicit. |

## Open Questions

- Should lookup default to all accessible dictionary entries or to a remembered
  language/source scope?
- Should translation loading be automatic for selected entries or user-triggered?
- Should list-scoped search live inside global lookup, or only inside the list
  view?
- Should the entry detail panel preserve the previous selected entry while the
  user types a new query, or should it follow the first result?

## Derived Requirements

- Global lookup must have a scope label that cannot be mistaken for list
  filtering.
- The list filter must be visually and textually distinct from dictionary
  source/language scope.
- Lookup-first detail should prioritize definition, examples, translation, and
  source; save/train actions should not compete with the meaning content.
- Detail membership must be real membership state or omitted from this scenario;
  the selected list name is not enough.
- Repeated lookup needs predictable detail selection when the query changes.
