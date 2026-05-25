# Scenario: Choose What To Train

Status: Draft
Primary role: Card-training user
Secondary roles: Single-language learner, List curator

## User Intent

When the user is ready to train, the user wants to know what list, scenario, and
card scope will be used, so that starting a session does not feel accidental or
ambiguous.

## Scope

In scope:

- Seeing the active training list.
- Changing the active training list.
- Seeing or changing the training scenario when relevant.
- Starting the default training session.
- Distinguishing viewed list, filtered search scope, and active training scope.

Out of scope:

- Detailed FSRS scheduling rules.
- Multi-student assignment workflows.
- Building new card types.

## Current UI Path

1. User sees training controls in the main training surface.
2. User can open settings/lists.
3. User sees active list indicators and list training settings.
4. User can start or continue training from the current state.
5. User can also change the active list from the footer list selector.
6. In the `Lijsten` tab, selecting a list currently flows through the same
   app-level list-change handler used for training scope.

## Intended Product Flow

1. User sees the current active training scope before starting.
2. User changes list or scenario if needed.
3. System confirms the new training scope.
4. User starts training.
5. System draws cards from the confirmed scope.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| See active training list | Partial | The footer and list tab show list names, but the label is compact and competes with viewed-list state. | Training surface needs a clear "training scope" summary: list, scenario, and card filter. |
| Change active list | Clear mechanically, ambiguous conceptually | Footer and settings can change the active list, but list browsing can do the same without an explicit "make active" action. | Changing active training list must be an explicit training-scope action. |
| See scenario/card mode | Partial | Scenario appears in footer/settings, and card filter appears in footer, but list-level training intent is separate. | Scenario, card filter, and list-level card policy must be presented as one effective scope before session start. |
| Start session | Ambiguous | The main screen continuously loads the next card after changes; there is no distinct confirmation that "this is the session scope". | Starting or resuming training must use the last explicit training scope and not be changed by passive list inspection. |
| Avoid scope confusion | Weak | Active list, selected list, dictionary source list, and list filter use overlapping labels like active/list/filter. | The product must reserve "active training list" for training scope only and use different labels for viewed list and search filters. |

## Role Variants

| Role | Difference |
|---|---|
| Card-training user | Needs minimal friction and clear start state. |
| Single-language learner | Needs list/scenario changes to be understandable, not technical. |
| List curator | May want to make the current inspected list active for training. |

## Open Questions

- Should active training scope be controlled primarily from the training surface
  or from list settings?
- Should viewing a list offer "train this list" without changing the persistent
  active training list?
- Should list-level `Trainingsinstellingen` define defaults for future sessions,
  override current session settings, or only describe the list contract?
- Should footer list changes immediately load a new card, or stage a scope
  change until the user starts/resumes training?

## Derived Requirements

- Active training scope must be represented as its own object, not inferred from
  whichever list is currently being viewed.
- The training surface should summarize effective list, scenario, card filter,
  and any list card policy together.
- Passive list browsing and list filtering must not change active training
  scope.
- A list view can offer `Train this list`, but it must state whether that is
  temporary or changes the persistent active training list.
- Scenario changes need the same explicitness as list changes because both
  affect the next card.
