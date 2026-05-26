# Search, Lists, And Training Source-Of-Truth Decision

Last updated: 2026-05-26
Status: Approved baseline for A1/A3/A6/A7/A8/A9 planning

## Purpose

This document defines the product objects and precedence rules for dictionary
search, learning lists, training sessions, and preferences. It is the baseline
for terminology, search ranking, lists IA, entry detail actions, footer scope,
and settings cleanup.

The main rule is that the app must not use one UI control or label to mean more
than one of these objects.

## Product Objects

| Object | Owns | Does not own | UI question it answers |
|---|---|---|---|
| Dictionary source | Dictionary entries, source metadata, schema/version, access/entitlement. | User list membership, active training scope, user progress. | Which reference did this entry come from? |
| Dictionary entry | One meaning-level source-backed lexical entry. | Whether the user saved it, learned it, or is training it by default. | What does this word/meaning say? |
| List | A curated or user-owned collection of dictionary entries. Lists may carry training defaults/recommendations. | Dictionary content itself, global preferences, current session state. | Which entries are grouped here? |
| Viewed list | Navigation context inside the list UI. | Active training scope. | Which list am I inspecting now? |
| Training session | The current practice run and its effective scope: list/session override, scenario, card filter, and queue behavior. | Dictionary source metadata, saved-list membership. | What am I practicing now or next? |
| Preferences | User defaults used when no stronger choice exists. | Current one-off actions, current session overrides, list membership. | What should the app choose by default next time? |
| User card state | Per-user progress for an entry and card type. | List membership and dictionary source. | Is this card new, due, learned, ignored, or otherwise scheduled? |

## Precedence

When more than one object could influence behavior, use this order:

1. One-off action, such as `Train dit woord` or `Markeer als geleerd`.
2. Current training session controls and temporary session overrides.
3. List defaults or recommendations.
4. Global preferences.

Lower-priority state may prefill or recommend higher-priority choices, but it
must not silently override them. Passive browsing, filtering, or selecting a
list for inspection must not change the active training session.

## Decisions

### Dictionary Source

A dictionary source is a content source, not a learning list. It owns entries
and metadata such as language, provider, schema, source version, ownership, and
access rules.

User-facing source metadata should appear as source information, for example
`Bron: Van Dale NT2` or `Woordenboekbron`, not as `In lijsten`.

### List

A list is an entry collection. It may be curated/system-owned or user-owned.
Lists can mix entries from multiple dictionaries and should not be treated as
hard language containers, even when they expose a primary language hint.

List membership and learning progress are independent. Adding an entry to a
list saves/groups that entry; it does not mark the entry new, due, learned, or
active for training unless the user performs a separate training/progress
action.

### VanDale 2k

`VanDale 2k` is a curated learning list backed by entries from the `nl-vandale`
dictionary source. It is not itself the dictionary source.

If the UI needs to show both concepts, use separate labels:

- dictionary source: `Van Dale NT2` or the source display name from dictionary
  metadata;
- learning list: `VanDale 2k`.

Do not use `VanDale 2k` as a substitute for "all Van Dale dictionary entries."

### Training From Dictionary Entries

Normal training draws from a training scope, usually an active learning list plus
scenario/card filters.

The app may also train directly from a dictionary entry through an explicit
one-off action. This does not require the entry to be in a learning list and
does not add list membership. The action creates a temporary queue override or
temporary session according to the action label.

Current baseline for `Train dit woord hierna`: it is a one-shot next-card
override. It makes the selected entry the next training card once, closes the
lookup/list/settings surface if that is where the action started, then normal
training resumes. It does not change the active training list, does not add the
entry to a list, and does not change global preferences. Returning to the
originating lookup/list/settings surface after the one-off card is not part of
the current flow.

### Search Scope

Dictionary lookup is independent from the active training list. It searches
accessible dictionary entries in the selected lookup language/source scope.

The active training language or global preferences may provide the initial
lookup language default, but the lookup scope remains a search setting, not a
training setting. Changing search language/source must not change the active
training list or session.

List-scoped filtering answers a different question: "Which entries inside this
viewed list match?" It must be visibly separate from global dictionary lookup.

### List Defaults

List-level training metadata is a recommendation/default for training that list:
scenario, card policy, supported card types, and similar intent metadata. It is
not the current session unless the user explicitly starts or switches training
to that list.

Do not label list defaults as global `Instellingen`. Prefer copy that makes the
scope clear, such as `Aanbevolen training voor deze lijst` or `Lijststandaard`.

### Global Preferences

Global preferences are defaults only. They may include interface language,
learning-language default, translation-language default, default search
dictionaries, default training scenario, default card types, and default
new/review mix.

Global settings must not duplicate current-session controls as if they own the
current training queue. If current training state appears in settings, show it as
read-only status or link back to the training scope control.

### Markeer Als Geleerd

`Markeer als geleerd` is a progress action for the current user. It must mutate
user card state only. It must not add or remove list membership, mutate the
dictionary entry, mutate the dictionary source, or change the active training
scope.

The UI must make the target clear. If the action applies to only the current card
type, say so in detail copy or placement. If it applies to multiple enabled card
types for the selected entry, the action must state that broader scope.

### Viewed List Versus Active Training List

Viewed list is navigation context. Active training list is training
configuration. Opening or selecting a list in `Lijsten` changes only the viewed
list.

To change training, use an explicit action such as `Gebruik voor training`,
`Train deze lijst nu`, or the approved A1 Dutch equivalent. The action must
state whether it changes the persistent active training list or starts a
temporary session.

## UI Term Boundaries

Use these concept boundaries before A1 finalizes exact Dutch labels:

| Concept | Acceptable UI direction | Avoid |
|---|---|---|
| Dictionary source | `Bron`, `Woordenboekbron`, source display name. | Showing source as list membership. |
| Dictionary lookup | `Zoeken in woordenboek`, `Woordenboek zoeken`. | `Actieve lijst zoeken` when not list-scoped. |
| Viewed list | `Bekeken lijst` only if A1 approves clearer copy; otherwise use list name plus list context. | `Actieve lijst` for a list being browsed. |
| Active training list | `Trainingslijst`, `Actieve trainingslijst`. | `Geselecteerde lijst` without scope. |
| List defaults | `Lijststandaard`, `Aanbevolen training voor deze lijst`. | `Trainingsinstellingen` if it looks global/current-session owned. |
| Current session | `Huidige training`, `Deze sessie`, `Training nu`. | Putting session controls under global preferences. |
| One-off action | `Train dit woord`, `Oefen dit woord nu`, or a more precise A1 label. | Labels that imply saving to a list or changing defaults. |

## Open Decisions

These are intentionally not resolved by this baseline and should be answered in
later focused tasks:

- Whether `Markeer als geleerd` should target one card type, all enabled card
  types for the entry, or ask when more than one target is available.
- Whether a future lookup-first workflow should return to the originating
  lookup/list/settings surface after the one-off training card.
- Whether list-scoped search should stay inside global lookup as an explicit
  filter state or move fully into the list-management surface.
- Which dictionary source and language defaults are remembered per user, per
  session, or per device.
- Whether user-created lists should have richer training defaults at creation
  time or only after the list has content.
- How unavailable, deleted, archived, or entitlement-lost sources/lists should
  appear in old memberships and training scopes.

## Implementation Guardrails

- UI copy must distinguish dictionary source, viewed list, active training list,
  current session, list defaults, and global preferences.
- Search, list browsing, and training controls may share components, but their
  state labels and mutation behavior must remain separate.
- Passive navigation must not mutate active training state.
- State-changing actions must refresh and show the resulting object state in
  place.
- A1 terminology, A3 search ranking, and IA cleanup tasks should cite this
  document rather than re-deciding the product model.
