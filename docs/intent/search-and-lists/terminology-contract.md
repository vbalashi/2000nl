# Search, Lists, And Training Terminology Contract

Last updated: 2026-05-26
Status: Approved baseline for UI copy cleanup

## Purpose

This document defines the Dutch UI terms for search, lists, dictionary sources,
training sessions, and preferences. It depends on
`source-of-truth-decision.md` and should be used before changing footer, entry
detail, list, settings, or search copy.

The goal is not to add more badges. The goal is to reserve each term for one
product object so the user can tell whether they are looking up entries,
browsing a list, changing a training session, or editing defaults.

## Label Map

| Concept | Primary Dutch label | Short/context label | Where it appears |
|---|---|---|---|
| Interface language | `Interfacetaal` | `Interface` | Global settings only. |
| Learning language | `Leertaal` | `Taal` when local context is already training/search. | Onboarding, training defaults, search/list language filters. |
| Translation language | `Vertaaltaal` | `Vertaling` | Global settings, translation controls, entry detail translation state. |
| Dictionary source | `Woordenboekbron` | `Bron` | Search filters, entry metadata, source selectors. |
| Dictionary lookup | `Woordenboek zoeken` | `Zoeken` inside the search tab. | Global search tab/modal. |
| Search scope | `Zoekbereik` | `Bereik` | Search controls and result summaries. |
| Viewed list | `Lijstweergave` | The list name plus `bekijken`. | Lists tab header/sidebar; avoid standalone `bekeken lijst` unless space requires it. |
| Training list | `Trainingslijst` | `Actieve trainingslijst` when persistent/default. | Footer/session summary and explicit training-scope controls. |
| List defaults | `Lijststandaard` | `Aanbevolen training` | List settings/recommendation panels. |
| Current session | `Huidige training` | `Deze sessie` | Footer/session summary, temporary override notices. |
| Global preferences | `Voorkeuren` | `Standaarden` | Global settings only. |
| Card filter | `Kaartfilter` | `Nieuw + herhaling`, `Nieuwe kaarten`, `Herhaling`. | Training session controls. |
| Training scenario | `Trainingsvorm` | Existing scenario display names. | Training scope controls and defaults. |
| Entry membership | `Opgeslagen in lijsten` | `In lijsten` only when source is not included. | Entry detail membership section. |
| One-off train action | `Train dit woord hierna` | `Train hierna` where entry context is obvious. | Entry detail action. |
| One-entry practice, future option | `Oefen dit woord nu` | `Oefen nu`. | Only if product changes to a true one-entry session. |
| Mark learned | `Markeer als geleerd` | `Geleerd` only on compact buttons. | Current card/detail progress action. |

The important distinction is that translation language is not the same as
interface language or learning language.

## Required Distinctions

### Interface, Learning, And Translation Language

Use `Interfacetaal` for the language of app chrome and instructions.

Use `Leertaal` for the language being learned or searched as source content.
When the user is already inside a training/search control, `Taal` is acceptable
only if the surrounding label makes the object clear.

Use `Vertaaltaal` for the language used for translations. Do not call this
`Taal` in global settings.

### Dictionary Source Versus List

Use `Woordenboekbron` or `Bron` for dictionaries such as Van Dale NT2.

Use `Lijst`, `Lijstweergave`, or `Trainingslijst` for collections of entries.
Do not call a dictionary source a list, and do not show dictionary source under
`Opgeslagen in lijsten`.

Use `VanDale 2k` only as a curated learning list. Use the dictionary source's
display name for the source itself.

### Search Scope

Use `Zoekbereik` for the active lookup/filter scope.

Use a result summary that states the object being searched:

- `Zoekt in woordenboekbronnen`
- `Zoekt in lijst: {listName}`
- `Geen resultaten in dit zoekbereik`

Do not use `Effectieve trainingsscope` in search UI.

### Viewed List Versus Training List

Use `Lijstweergave` or copy around the list name for the list currently being
inspected.

Use `Trainingslijst` or `Actieve trainingslijst` only for the list normal
training draws from. Passive list selection must not use active-training terms.

### Current Session Versus Defaults

Use `Huidige training` or `Deze sessie` for controls that affect the current
practice flow.

Use `Voorkeuren`, `Standaarden`, or a specific default label for global settings.
If global settings show current training state, label it as status and link back
to the session control instead of editing it there.

### List Defaults

Use `Lijststandaard` or `Aanbevolen training voor deze lijst` for list-owned
training recommendations such as default scenario, card policy, and card types.

Do not label these controls simply `Trainingsinstellingen`, because that reads
as either current-session or global settings.

### One-Off Actions

For the current one-shot next-card behavior, use `Train dit woord hierna`. It
communicates that the selected entry is next once and does not imply list
membership or a full one-entry session.

Reserve `Oefen dit woord nu` for a future true one-entry quick-practice session
that returns to the originating context after completion.

Use `Markeer als geleerd` only for progress state. If the action targets a
specific card type, the UI must expose that target in nearby copy or placement.

## Terms To Remove Or Rename

| Current/ambiguous term | Replace with | Reason |
|---|---|---|
| `bekeken lijst` | Prefer `Lijstweergave`, or use `{listName} bekijken`. | `Bekeken lijst` sounds like an internal state label. |
| `Effectieve trainingsscope` | `Huidige training` or `Trainingsbereik`, depending on placement. | `Scope` is internal and too abstract for learner-facing UI. |
| `Alleen deze lijst` | `Zoek in deze lijst` or `Alleen in {listName}`. | Must state whether this is search/filter scope, not training scope. |
| `Alleen actieve lijst` | `Zoek in trainingslijst` only if it truly searches the active training list. | `Actieve lijst` is overloaded. |
| `Trainingsinstellingen` for list metadata | `Lijststandaard` or `Aanbevolen training voor deze lijst`. | Avoids confusing list defaults with global/session settings. |
| `Trainingsinstellingen` for global settings | `Trainingsvoorkeuren` or specific default labels. | Makes settings default-owned. |
| `Bevriezen` | `Later oefenen`, `Pauzeren`, or `Niet nu`, depending on behavior. | `Bevriezen` is technical and unclear for learners. |
| `Bronlijst` | `Woordenboekbron` or `Lijst`, never both. | Prevents source/list collapse. |
| `Actieve lijst` | `Actieve trainingslijst` or `Lijstweergave`. | Must say whether it controls training or browsing. |

## Placement Rules

- Search tab: use dictionary lookup terms first; show list filtering only as an
  explicit alternate search scope.
- Lists tab: use list-browsing terms first; dictionary browsing, if present,
  must be a mode with its own `Woordenboekbron` label.
- Footer: use `Huidige training` plus a compact summary of training list,
  training form, and card filter.
- Entry detail: show source as `Bron`, membership as `Opgeslagen in lijsten`,
  and actions after the entry content.
- Global settings: use `Voorkeuren`/default labels and separate
  `Interfacetaal`, `Leertaal`, and `Vertaaltaal`.
- List settings: use `Lijststandaard` or `Aanbevolen training voor deze lijst`.

## Copy Test

Before shipping new UI copy, each visible label should pass these checks:

- Could a user tell whether this control changes lookup, viewed list, current
  training, or defaults?
- Does the label avoid using `actief` unless the object is truly the active
  training state?
- Does source metadata appear as source metadata, not list membership?
- Does a one-off action explain whether it affects only the next card, the
  session, list membership, progress, or defaults?
