# Search And Lists Intent Map

Last updated: 2026-05-25
Status: Draft

## Purpose

This document captures the intended product behavior for dictionary search, word
lists, list membership, and training entry points. It is not a visual design or
implementation plan. Its job is to make user intentions, object boundaries, and
navigation rules explicit before redesigning UI surfaces.

Use this document to decide what the interface must make clear. When a concrete
UI change is ready to implement, create a separate execution plan under
`docs/exec-plans/active/`.

## Document Set

- [Personas and roles](./personas.md) - working user types and their different
  product priorities.
- [Scenario template](./scenarios/_template.md) - repeatable format for
  documenting and comparing individual workflows.
- [Find a word and understand it](./scenarios/find-word-understand.md)
- [Find a word and add it to a list](./scenarios/find-word-add-to-list.md)
- [Inspect which lists contain an entry](./scenarios/inspect-entry-membership.md)
- [Inspect and manage a list's words](./scenarios/manage-list-words.md)
- [Choose what to train](./scenarios/choose-training-scope.md)
- [Train one entry now](./scenarios/train-one-entry-now.md)
- [Current UX gap report](./current-ux-gap-report.md)
- [UX review response](./ux-review-response.md) - senior UX review verdict
  and required changes before implementation.

Add individual scenario files under `./scenarios/` when a flow needs more detail
than the summary table in this index.

## Product Context

2000nl helps users learn Dutch vocabulary through dictionary-backed lookup,
curated and user-created lists, and spaced repetition training.

Search, lists, and training are connected but serve different user intentions:

- Search helps the user find and understand any accessible dictionary entry,
  whether or not that entry belongs to a learning list.
- Lists help the user save, group, inspect, and manage entries.
- The active training list controls the default training scope.
- Training sessions turn entries into reviewable cards and learning progress.

## Current UX Assessment

The current interface already supports the main actions, but several contexts
look and behave similarly enough that the user's mental model can break down.

Observed strengths:

- Global search can find dictionary entries and show definitions, examples,
  source metadata, and entry actions.
- The list surface can show the active curated list and its contents.
- Entry detail exposes actions such as adding to a list, marking learned, and
  training a word.
- The app already distinguishes dictionary sources, curated lists, user lists,
  and the active training list at the data/model level.

Observed friction:

- Global dictionary search and list-scoped search/filtering are visually close
  but answer different questions.
- "Active list" can mean a list currently selected for training, a list being
  viewed, or a filter applied to search results.
- A word can be presented as a dictionary entry, a member of a list, and a
  trainable card source, but the UI does not always make that state transition
  explicit.
- List membership is visible, but it is not yet the central organizing concept
  in entry detail.
- "Train this word" needs a precise product meaning: start a one-entry session,
  add the entry to the active training scope, or temporarily override the queue.
- The list view supports inspection, search, filtering, and pagination, but the
  relationship between list management and dictionary lookup still needs clearer
  rules.

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

## User Intent Map

| Intent | User question | Starts from | Expected outcome | Current friction | Requirement |
|---|---|---|---|---|---|
| Find meaning | What does this word mean? | Global search | Definition, examples, source, and relevant entry actions. | Search can resemble list filtering. | Global dictionary search must be visually and textually distinct from list-scoped search. |
| Add entry to list | How do I save this word for later? | Entry detail or search result | Entry is added to a chosen list and the new membership is visible. | Membership is secondary to generic actions. | Entry detail must show current list membership and add/remove actions as first-class state. |
| Inspect membership | Which lists already contain this word? | Entry detail | User sees all lists containing the entry. | Membership is not always the main answer after lookup. | Entry detail must answer membership before asking the user to choose another list. |
| Train one entry | Can I train this word now? | Entry detail | User understands whether this starts a one-entry session or changes training scope. | "Train this word" is ambiguous. | The product must define and label the exact behavior of single-entry training. |
| Manage a list | What is in this list? | Lists tab | Sortable/filterable entries scoped to the selected list. | Looks close to dictionary search. | List view must clearly show the current list as the scope and keep list actions separate from lookup actions. |
| Change training scope | What am I training by default? | Training UI or list settings | Active training list is changed with clear confirmation. | Active/viewed/filter list concepts can blur. | Active training scope must be represented separately from the currently viewed list and from search filters. |
| Continue lookup workflow | I found one word; can I search the next? | Search detail | User can continue searching without losing useful state. | Detail and action panels may compete with result browsing. | Search should support fast repeated lookup while preserving the selected entry context. |

## Primary Flows

These flows now have individual scenario files. Keep this section as a compact
overview and use the scenario files for current-state evidence, role
differences, variants, or concrete requirements.

### Find A Word And Understand It

1. User opens global search.
2. User enters a word or phrase.
3. System returns dictionary entries across the allowed source scope.
4. User selects the relevant entry/meaning.
5. System shows definition, examples, source, list membership, and available actions.
6. User can continue searching, add to a list, or train the entry.

### Find A Word And Add It To A List

1. User finds and selects an entry.
2. System shows which lists already contain the entry.
3. User chooses a target list.
4. System adds the entry to that list.
5. System updates membership state in place.
6. User can continue lookup or open the target list.

### Inspect And Manage A List

1. User opens the lists area.
2. User selects a list.
3. System shows list metadata and entries scoped to that list.
4. User can search, sort, filter, select, add, or remove entries within that list.
5. System keeps the selected list scope visible throughout the workflow.

### Choose What To Train

1. User reviews the current active training list and training scenario.
2. User changes the active list or scenario if needed.
3. System confirms the active training scope.
4. User starts a training session.

### Train One Entry Now

1. User opens entry detail.
2. User chooses the single-entry training action.
3. System states the scope of the upcoming session.
4. User starts or cancels.
5. System returns the user to the previous context after the session.

## Navigation Rules

- From a search result, the user must be able to open entry detail.
- From entry detail, the user must be able to add or remove list membership.
- From entry detail, the user must be able to open each list that contains the entry.
- From a list, the user must be able to inspect an entry without losing list context.
- From a list, the user must be able to make that list the active training list.
- From the training surface, the user must be able to see and change the active training scope.
- Search filters must not silently change the active training list.
- Viewing a list must not silently change the active training list.

## Visibility Rules

- Global search must show that it searches dictionary entries, not only the
  active training list.
- List search/filtering must show which list is being searched.
- Entry detail must show source, definition, examples, membership, and training
  state/actions.
- The active training list must be visible wherever training can be started.
- Actions that mutate state must show the new state after completion.

## Open Product Questions

- Should "Train this word" start a one-entry temporary session, enqueue the word
  in the active training list, or change the training scope?
- Should global search default to all accessible dictionaries, the active
  training list, or the last used scope?
- Should adding an entry to a list also start learning progress, or should those
  remain separate actions?
- Should list membership be shown as badges, a dedicated section, or an editable
  control in entry detail?
- Which list sorting dimensions matter first: headword, part of speech, source,
  date added, progress state, due status, or frequency/order?
- Can curated lists be modified directly by the user, or only copied/extended
  into user-owned lists?

## Derived Requirements

- The app must distinguish dictionary lookup, list inspection, and training
  scope selection as separate contexts.
- A selected entry must expose list membership as state, not just as an action.
- The current list being viewed must not be confused with the active training
  list.
- The active training list must not be changed by passive browsing or filtering.
- Single-entry training behavior must be defined before changing the UI label or
  placement.
- List management must support at least search/filtering and should define the
  first useful sort dimensions before implementation.

## Next Research Step

After this initial assessment, the next step is not to compare against generic
"common sense" or immediately design missing features. The next step is to mine
the intended user steps for the primary workflows and compare them against the
current UI state.

For each primary flow, capture:

- the user's starting point;
- the user's question at that point;
- the object being acted on;
- the next expected system state;
- whether the current UI supports it clearly, supports it ambiguously, or does
  not support it;
- the minimum requirement needed to remove ambiguity.

This produces a gap map. Only after the gap map is stable should the project
move into UI redesign or implementation planning.
