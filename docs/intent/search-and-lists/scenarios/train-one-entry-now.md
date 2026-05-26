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
- Closing the lookup/list/settings surface and continuing normal training after
  the one-off card.

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
5. If the entry is found, the app presents it as the next card once; after
   review, normal training queue behavior continues.
6. The app does not automatically return to the prior search/list/settings
   surface; this is accepted current behavior.

## Intended Product Flow

1. User opens entry detail.
2. User chooses to train this entry now.
3. System makes the action scope explicit: the selected entry becomes the next
   card once.
4. The lookup/list/settings surface closes.
5. System trains the entry without adding list membership or changing the active
   training list.
6. After review, the normal training queue continues from the existing training
   scope.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| Find action | Clear | `Train dit woord` is available in entry detail. | Keep a direct single-entry training affordance where entry detail actions are shown. |
| Understand behavior | Handled | The action is labelled as a next-card override, not list membership or a separate session. | Keep copy explicit that the selected entry is next once. |
| Start one-entry training | Mostly handled | The override presents the selected entry and shows visible fallback if lookup fails. | Failure to train the selected entry must remain visible, and fallback must not feel like success. |
| Continue normal training | Handled | Settings/search/list context closes and normal training continues after the override card. | Do not reopen the lookup/list/settings surface unless a future product decision changes this flow. |
| Preserve progress semantics | Handled | Reviewing the override card records normal progress without adding list membership or changing active training scope. | Keep membership and progress independent. |

## Role Variants

| Role | Difference |
|---|---|
| Single-language learner | Wants a quick path from interest to practice. |
| Lookup-first user | May not want training prompts to dominate lookup. |
| Card-training user | May expect this to behave like a normal scheduled review session. |

## Resolved Decisions

- `Train dit woord hierna` makes the selected entry the next card once.
- The action closes the lookup/list/settings surface.
- It does not add the entry to a list.
- It does not change the active training list or global preferences.
- It may create or update normal card progress through the review answer.
- After the override card is reviewed, normal training continues from the
  existing training scope.
- Automatic return to the originating lookup/list/settings surface is not part
  of the current flow.

## Derived Requirements

- `Train dit woord hierna` must remain a one-shot next-card override unless the
  product explicitly changes the flow.
- The override must not add list membership, remove list membership, or change
  active training scope.
- The override may record normal card progress if the selected entry/card type is
  trainable.
- If the selected entry cannot be trained, the system must show the failure and
  continue normal training rather than silently presenting fallback as success.
- After the override card is answered, normal training must continue from the
  existing queue/training scope.
