# SettingsModal Entry-Point And Task Map

Status: Wave 0 current-state characterization
Date: 2026-07-24

This map records what the current `SettingsModal` does before it is separated
through the persistent-shell strangler. It is descriptive, not the target
information architecture.

## Current Container

`TrainingScreen` owns the modal and remains mounted behind it. The modal has
four peer tabs:

```text
Zoeken | Lijsten | Statistieken | Instellingen
```

The header describes the whole container as `Woorden en lijsten`, although two
tabs are statistics and application/training preferences. The four areas
therefore share an overlay and lifecycle but not one user goal.

## Entry Points

| Entry point | Initial destination | Extra context | Current owner |
| --- | --- | --- | --- |
| Training header `Zoeken` | `zoeken` | Autofocus query; clears viewed-list handoff | `TrainingScreen.openSearch` |
| Training header `Instellingen` | `instellingen` | Clears viewed-list and search-focus handoff | Header settings handler |
| Footer list/scenario controls | `instellingen` | Opens the modal from the current training summary | `FooterStats.onOpenSettings` |
| Dictionary-card membership action | `lijsten` | Opens one concrete list by ID/type | `TrainingScreen.openMembershipList` |
| Search-result membership action | `lijsten` | Retains the selected list inside the already-open modal | `SettingsModal.openMembershipList` |
| Settings `Wijzig trainingslijst in Lijsten` | `lijsten` | No new route; switches the local tab | Settings training section |

On close, `TrainingScreen` resets the next initial tab to `instellingen`,
clears viewed-list handoff, and clears search autofocus. The
`SettingsModal` search state is also discarded because the component
unmounts.

## Task Inventory

### Zoeken

Primary tasks:

- search the dictionary independently of the current training language;
- choose lookup language and dictionary source;
- optionally constrain lookup to the viewed list;
- inspect an entry and its list memberships;
- create a private editable entry;
- jump from an entry membership to its list;
- request that an entry become the next training card.

State/lifetime:

- query, results, detail selection, pagination, and list-only filter persist
  while switching tabs inside one open modal;
- all of that state resets after the modal closes;
- lookup and list browsing do not change the active training scope unless the
  user invokes a separate explicit training/list action.

### Lijsten

Primary tasks:

- distinguish curated training lists from user lists;
- create and manage a user list;
- choose the viewed list without necessarily changing the training list;
- inspect list content or dictionary-entry projections;
- filter list content by text, POS, and additional filters;
- make a list active for training;
- inspect list-specific training settings and information.

Current modeling leak:

- the VanDale dictionary source is identified by a name regex and then excluded
  from training-list candidates;
- dictionary discovery, list membership, and training-list selection are
  therefore visually separated but still coupled through list-shaped data.

### Statistieken

Primary tasks:

- see today's new/review card counts;
- see aggregate learned/total progress;
- read three static training tips.

The tab has no date range, history, drilldown, goal editing, or link back to a
specific training setup. It behaves as a small dashboard placed beside three
operational areas.

### Instellingen

Application preferences:

- theme;
- audio quality/provider tier;
- interface/instruction language;
- translation language;
- default learning language;
- tutorial restart;
- application version.

Training setup/preferences:

- current effective training summary;
- active training list handoff;
- active scenario;
- enabled card types;
- dictionary-source display;
- new/review filter;
- new/review mix.

These controls apply through different owners, but the interface presents them
as one immediate settings page. There is no draft/apply boundary.

## State And Mutation Boundaries

| Interaction | Current behavior |
| --- | --- |
| Switch modal tabs | Keeps the mounted Training card and transient session state |
| Close modal | Keeps Training card/reveal state; discards modal-local search/view state |
| Change scenario, card types, filter, ratio, language, or active list | Applies through current handlers and may reset/reload the active training session |
| View another list | Does not by itself change the active training list |
| Change theme/audio/interface/translation defaults | Persists immediately through preference handlers |
| Open/close modal | Must not submit a review or mutate lookup/progress state |
| Refresh/tab close | Ends the transient Training session; ADR 0005 deliberately does not promise resume |

Focused characterization now covers:

- search state persists across modal tabs;
- search state resets after modal close;
- viewed list remains distinct from active training list;
- training settings persist to the current language scope;
- reviewed-in-session exclusions reset on an explicit scenario change;
- current Training card and revealed answer survive modal tab navigation and
  close.

## Strangler Destination Map

| Current area | First target destination | What stays compatible during extraction |
| --- | --- | --- |
| `Zoeken` | Library / Dictionary search | Existing search state and explicit entry/list actions |
| `Lijsten` | Library / Lists | Viewed-vs-active list distinction and list ownership |
| `Statistieken` | Statistics | Existing summary while deeper reporting remains out of scope |
| Training controls inside `Instellingen` | Training Setup | Existing active training-scope persistence and reset boundary |
| Theme/language/tutorial/version | App Settings | Preference handlers; language/TTS redesign stays separate |

The persistent shell must keep the existing `TrainingScreen` instance mounted
until session ownership is deliberately moved. Extracting a destination must
not turn modal-local browsing into an implicit session mutation.

## Code Evidence

- modal tabs and content:
  `apps/ui/components/training/SettingsModal.tsx:29-79,417-805`;
- modal-local search and viewed-list state:
  `SettingsModal.tsx:116-148,235-329`;
- Training entry-point state and handlers:
  `apps/ui/components/training/TrainingScreen.tsx:313-320,1333-1350`;
- header and footer entry points:
  `TrainingScreen.tsx:2100-2170,2588-2610`;
- modal close/reset:
  `TrainingScreen.tsx:2653-2680`;
- footer quick controls:
  `apps/ui/components/training/FooterStats.tsx:148-231`;
- characterization tests:
  `apps/ui/tests/TrainingScreen.test.tsx`.
