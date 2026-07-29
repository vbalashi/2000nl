# Shared SenseCard Visual Specification v1

Date: 2026-07-29  
Status: frozen visual contract for 2000NL and the AudioFilms extension  
Owner: 2000NL Platform and shared dictionary UX  
Source canvas: `/Users/khrustal/dev/pens/2000nl-audiofilms.pen`

## Purpose

SenseCard v1 is the shared presentation and interaction contract for a
meaning-level dictionary entry in:

- the 2000NL web application;
- the AudioFilms Chrome extension dictionary overlay.

The same semantic structure should produce recognizably the same card in both
products. Product shells, navigation, search-result previews, and authentication
entry points may differ.

The real-data contract is
[`sense-card-real-data-contract-audit.md`](sense-card-real-data-contract-audit.md).
Runtime publication is owned by
[2000NL #70](https://github.com/vbalashi/2000nl/issues/70).

## Canonical Components

Use the visible Pen address in human communication. Hidden Pen node IDs are
included only for deterministic tooling.

| Visible address | Contract | Tool node |
| --- | --- | --- |
| `10.15.03` | ReviewButton, shared by all review choices | `I6vVsn` |
| `10.15.04` | Single-sense Full master, 520 px | `zaOtq` |
| `10.15.05` | Single-sense Narrow master, 340 px | `dbWzU` |
| `10.16.01` | Multi-sense Full master, 520 px | `MeY0G` |
| `10.16.02` | Multi-sense Narrow master, 340 px | `rc1mH` |

Approved boards are immutable references. Implementation should consume the
hierarchy and states below, not copy arbitrary legacy frames from zone `90`.

## Evidence Index

| Visible address | What it proves | Snapshot |
| --- | --- | --- |
| `00.10` | canvas navigation, visible-address registry and frozen status | [canvas index](evidence/sense-card-visual-spec-v1/00.10-canvas-index.png) |
| `20.10` | single-sense new, learning, known; Full and Narrow | [single-sense states](evidence/sense-card-visual-spec-v1/20.10-single-sense-states.png) |
| `20.20` | several meaning-level entries grouped under one headword | [multi-sense group](evidence/sense-card-visual-spec-v1/20.20-multi-sense-group.png) |
| `20.30` | each meaning has independent learning state and actions | [independent learning states](evidence/sense-card-visual-spec-v1/20.30-independent-learning-states.png) |
| `20.70` | Full translation OFF/ON, corner number, expanded/collapsed actions | [Full translation states](evidence/sense-card-visual-spec-v1/20.70-full-translation-states.png) |
| `20.71` | Narrow translation OFF/ON and long compound wrapping | [Narrow responsive states](evidence/sense-card-visual-spec-v1/20.71-narrow-responsive-states.png) |
| `20.80` | sparse and rich optional content at both widths | [optional content](evidence/sense-card-visual-spec-v1/20.80-optional-content.png) |
| `50.20` | article/headword stress, morphology, NL/RU interface copy | [header and localization stress](evidence/sense-card-visual-spec-v1/50.20-header-localization-stress.png) |
| `50.30` | loading, no match, translation, audio, mutation and guest states | [exception states](evidence/sense-card-visual-spec-v1/50.30-exception-states.png) |

Snapshot hashes and tool IDs are recorded in
[`manifest.json`](evidence/sense-card-visual-spec-v1/manifest.json).

## Identity and Ownership

One SenseCard targets:

```text
entryId + cardTypeId
```

A headword group is a presentation container for several entries. It is not a
learning target. A corner number is display order inside that returned group;
it is not an entry ID and must never be sent as an action target.

| Visible element or action | Semantic source | Scope |
| --- | --- | --- |
| Headword and pronunciation | Platform presentation DTO | group presentation |
| Article/gender and part of speech | Platform presentation DTO; clients do not infer | group/article presentation |
| `2K` frequency chip | dictionary frequency membership | group presentation |
| Meaning count after the `BETEKENISSEN` rule | number of returned entries in the group | group presentation |
| Corner number | backend-provided display order | presentation only |
| Repetition count / New state | user card state for `entryId + cardTypeId` | one SenseCard |
| Short meaning translation | direct translation bound to the entry and target language | one entry |
| Definition, Usage Pattern, example, idiom, note | typed semantic section | one entry |
| Section translation | `sectionBindingId` translation binding | one section |
| Audio | backend capability and audio action/URL | owning entry or group capability |
| Learn, review, mark known, undo known | explicit Platform capability/action ID | one SenseCard |
| Meaning report | `entryId`, optionally `sectionBindingId` | one entry/section |
| Headword More menu | explicit group identity and group-owned actions only | group |

The backend decides which entries belong in one group, including POS and
homograph boundaries. Clients render the returned grouping and do not recreate
it from visible headword text.

## Content Hierarchy

The base hierarchy is:

1. metadata and headword;
2. optional short translation;
3. one or more meaning-level SenseCards;
4. definition or the first suitable source section;
5. optional Usage Pattern;
6. examples;
7. idioms and other approved optional sections;
8. review/learn controls and quiet secondary actions.

Rules:

- a one-sense headword has no redundant `1` chip;
- a multi-sense headword gives every meaning a corner number and independent
  card state;
- missing optional content consumes no space;
- a meaning without a definition uses the first suitable semantic section and
  never invents definition text;
- synonyms, antonyms, full morphology, reference tables, and rich Word Details
  are outside the default v1 card and remain owned by
  [#84](https://github.com/vbalashi/2000nl/issues/84).

## Translation Behavior

- OFF reserves no empty translation row.
- ON inserts the short meaning translation above source definition content.
- Translated definition and example stay visually paired with their source
  sections; there are no decorative translation arrows in v1.
- Translation changes card height intrinsically. Implement a short ease-out
  height/opacity transition and respect reduced motion.
- Missing translation uses the OFF geometry and keeps Dutch source content
  visible.
- Pending and failure affect only the owning capability/section. One local
  recovery action is shown when recovery is possible.
- A client must use direct section bindings. It must not rejoin translations by
  array order.

## Responsive and Interaction Rules

- Canonical widths are Full `520` and Narrow `340`.
- Full review actions form one row; Narrow review actions form a `2 × 2` grid.
- Long headwords keep article and first-line headword baselines optically
  aligned, use supplied pronunciation separators, and wrap at safe break
  opportunities.
- The whole collapsed meaning surface is the expand target and must support
  pointer and keyboard activation.
- Collapsed meanings do not show per-meaning More, Report, or a redundant
  disclosure button.
- Expanded meanings keep an explicit collapse control and a quiet localized
  report action in the footer.
- Review/learn/known controls belong inside each meaning-level SenseCard, never
  once below the entire headword group.
- Mark known is available before learning, is reversible, and after success
  becomes a visibly completed state with an undo action.

## Localization

Interface copy is resolved from semantic message keys using the selected
interface locale. It is independent of:

- dictionary language;
- translation target language;
- content language.

Required key families are:

```text
sensecard.section.*
sensecard.state.*
sensecard.translation.*
sensecard.action.*
sensecard.auth.*
```

Dutch and Russian text on the approved boards is fixture copy, not a value to
hardcode. Part-of-speech labels also come from localized semantic codes.

## Exceptional States

Approved `50.30` establishes these invariants:

- preserve readable source content when an optional capability fails;
- distinguish lookup loading/no match from translation or audio failure;
- disable only the unavailable action;
- show one recovery action when the failure is recoverable;
- during review submission, prevent duplicate mutation without replacing the
  rest of the card;
- guest/auth state replaces progress controls, not dictionary content;
- auth CTA depends on product context: connect 2000NL from AudioFilms, sign in
  inside 2000NL.

The older `50.10` and `50.11` alternatives remain parked evidence. They are not
part of v1 and must not be implemented as competing state models.

## Out of Scope

- AudioFilms grouped search preview rows:
  [AudioFilms #36](https://github.com/vbalashi/audiofilms/issues/36);
- optional Word Details:
  [2000NL #84](https://github.com/vbalashi/2000nl/issues/84);
- personal definition/translation overrides: separate contract gap recorded by
  the real-data audit;
- final parser/source re-import mechanics;
- 2000NL navigation, Training Plan, Queue Builder, and Settings information
  architecture;
- the non-extension AudioFilms application.

## Version Boundary

Frozen in v1:

- component anatomy and Full/Narrow hierarchy;
- meaning-level action ownership;
- translation OFF/ON geometry;
- optional-content omission rules;
- collapsed/expanded interaction model;
- localization ownership;
- exceptional-state invariants.

Not frozen:

- fixture words, translations, counts, and IDs;
- exact localized copy;
- implementation-specific focus-ring rendering;
- subpixel baseline corrections required by real browser font metrics;
- future optional sections behind explicit capabilities.

## Change Process

1. Open or link a GitHub issue that states the affected v1 rule.
2. Create a visibly numbered Working or Exploration board in the correct Pen
   zone. Do not edit a canonical Approved board as an untracked experiment.
3. Build from the approved reusable component and prove propagation with
   instances.
4. Validate Full and Narrow, translation OFF/ON, realistic long copy, and
   affected exceptional states.
5. Run independent visual QA and record findings.
6. Obtain owner approval, mark the visible board Approved, then update this
   document and evidence manifest in the same change.
7. Implementation consumes only the new approved version.

Classification:

- `v1.x patch`: token, spacing, copy-key, or accessibility correction that does
  not change hierarchy or ownership;
- `v1.x minor`: additive optional state/section with backward-compatible
  fallback;
- `v2`: changed identity, action ownership, required hierarchy, or incompatible
  state behavior.

Every implementation PR must cite this spec version and list any deliberate
deviation. A deviation without a linked design issue is a defect, not a new
implicit contract.
