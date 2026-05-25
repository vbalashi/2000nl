# Scenario: Train One Entry Now

Status: Draft
Primary role: Single-language learner
Secondary roles: Lookup-first user, Card-training user

## User Intent

When the user is looking at one useful entry, the user wants to train that entry
immediately, so that the moment of interest can become learning practice without
first managing a list.

## Scope

In scope:

- Starting a training action from one selected entry.
- Explaining the scope of the action before or during start.
- Returning to the previous lookup/list context after the action.

Out of scope:

- Changing the global FSRS algorithm.
- Building a custom training deck editor.
- Teacher assignment flows.

## Current UI Path

1. User opens entry detail.
2. User clicks `Train dit woord`.
3. The handler stores the entry id as a forced next word and closes settings if
   the action came from the settings/search/list modal.
4. The next training load tries to fetch that entry by id.
5. If the entry is found, the app presents it using the first enabled training
   mode; after review, normal training queue behavior continues.
6. The app does not show a one-entry session boundary or automatically return
   the user to the prior search/list context.

## Intended Product Flow

1. User opens entry detail.
2. User chooses to train this entry now.
3. System makes the session scope explicit: one entry, temporary set, active
   list addition, or another defined behavior.
4. User confirms or starts.
5. System trains the entry using the appropriate card type/scenario.
6. User returns to the previous search/list context.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| Find action | Clear | `Train dit woord` is available in entry detail. | Keep a direct single-entry training affordance where entry detail actions are shown. |
| Understand behavior | Missing | The label does not say whether it starts a temporary one-entry session, changes scope, adds to a list, or queues one card before normal training resumes. | The action label and pre-start state must define the exact behavior. |
| Start one-entry training | Partial | Forced next word exists and can present the selected entry, but it silently falls back to normal selection if lookup fails. | Failure to train the selected entry must be visible, and fallback must not feel like success. |
| Return to context | Missing | Settings/search/list context is closed and there is no automatic return after the one entry is reviewed. | If the flow is "train one entry now", completion must return to the originating context or offer an explicit next step. |
| Preserve progress semantics | Ambiguous | Reviewing the forced card records normal progress, but the entry is not necessarily saved to a list and the card mode comes from current preferences. | Product must define whether single-entry training creates progress without list membership and which card type/scenario it uses. |

## Role Variants

| Role | Difference |
|---|---|
| Single-language learner | Wants a quick path from interest to practice. |
| Lookup-first user | May not want training prompts to dominate lookup. |
| Card-training user | May expect this to behave like a normal scheduled review session. |

## Open Questions

- Does "train this word" start a temporary one-entry session?
- Does it add the entry to a list first?
- Does it create learning progress if the entry was never saved?
- What happens after one card is completed?
- Which training mode should be used when the user starts from entry detail:
  active scenario default, first enabled mode, or a dedicated quick-practice
  mode?
- Should this action be available to lookup-first users by default, or hidden
  behind a learning action group?

## Derived Requirements

- `Train dit woord` must have one defined product meaning before UI routing
  changes.
- Recommended meaning: start a temporary one-entry quick-practice session for
  the selected entry.
- One-entry quick practice must not add list membership, remove list
  membership, or change active training scope.
- One-entry quick practice may record normal card progress if the selected
  entry/card type is trainable.
- The card mode must be explicit: active scenario default, dedicated
  quick-practice mode, or a visible user choice when needed.
- If the selected entry cannot be trained, the system must show the failure and
  return to the originating context rather than silently falling back to the
  normal queue.
- Completion must return to the originating entry context or present explicit
  next actions: continue normal training, save to list, or go back.
