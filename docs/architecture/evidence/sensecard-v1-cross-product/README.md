# SenseCard v1 cross-product gate

Status: review ready; product-owner approval pending  
Gate owner: `vbalashi/2000nl#79`  
2000NL baseline: `870bff926c3709be49550b69dcc25b795ab8f997`  
AudioFilms baseline: `efe7aae771c0bb5f2b70cd8d30f732a25fb30ff5`

## Decision boundary

This gate validates one semantic SenseCard contract in two intentionally
different product contexts. It does not require identical outer shells:

- 2000NL Training presents one exact `entryId` at a time as Face → Answer.
- 2000NL Library presents all entries in one `headwordGroupId`, while every
  meaning keeps independent expansion, translation and learning state.
- AudioFilms presents the same headword group inside an extension overlay,
  with independent controls per `entryId` and selected-word context around it.

The group is presentation context. The learnable and mutable unit is always a
single SenseCard target: `entryId + cardTypeId + stateRevision`.

## Shared scenario manifest

The two repositories use product-owned adapters, but the scenarios below are
the shared fixture contract. Differences in literal IDs, target translation
language and surrounding shell are intentional and must not alter semantics.

| ID | Shared input/state | 2000NL adapter | AudioFilms adapter | Required invariant |
| --- | --- | --- | --- | --- |
| `SC-01` | one Dutch noun sense, translation off | `singleSenseGroup` / `singleSenseEntry` | `mockSenseCardLookup({ singleSense: true })` | no ordinal chip for a one-sense group; source definition remains visible where the context exposes Answer/body |
| `SC-02` | one sense, translation on | training fixture translations | single-sense presentation with `translationVisible: true` | entry, definition and example translations remain attached to their own semantic targets |
| `SC-03` | `bank`, two meanings with different learning phases | `multiSenseBankGroup` | default `mockSenseCardLookup()` | controls and local UI state for meaning 1 do not mutate meaning 2 |
| `SC-04` | rich content hierarchy | optional usage-pattern/idiom test data | semantic content-node presentation | node `kind`, parent and translation pairing are preserved |
| `SC-05` | sparse content | entry with definition and no optional sections | collapsed/single-sense overlay | absent sections reserve no semantic placeholder content |
| `SC-06` | long compound headword | long-headword responsive fixture | long-headword overlay fixture | headword wraps without separating article semantics or obscuring actions |
| `SC-07` | interface language `nl`, `en`, `ru` | `platformV2ClientI18n` | `senseCardPresentation.interfaceLanguageCode` | labels come from interface language; dictionary content remains source language |
| `SC-08` | Known and Undo | Platform V2 action capability/response | semantic action workflow | undo addresses the active Known Mark and exact prior card state, not the headword group |
| `SC-09` | translation pending/failed | Library translation session tests | extension translation/error workflow | failure is local, retryable and does not replace source content |
| `SC-10` | report content | typed entry/content/translation target | per-entry `report-content` capability | report carries the exact entry/content identity; no inference by displayed order |

## Contract compatibility

| Concern | Result | Evidence |
| --- | --- | --- |
| Group identity | compatible | both expose `headwordGroupId` and an ordered `entries[]` collection |
| Learning identity | compatible | capabilities target `entryId`, `cardTypeId`, `stateRevision` |
| Meaning order | compatible | both expose nullable `meaningOrdinal`; it is presentation metadata, not identity |
| Content hierarchy | compatible | the same six typed node kinds, stable node IDs, parent IDs and fingerprints are supported |
| Translation identity | compatible | entry and node translations carry target language, fingerprint/policy evidence and status |
| Known rollback | compatible | both retain active Known Mark ID and revision for `undo-known` |
| Localization | compatible | both resolve UI labels independently from source dictionary content |
| Word details | compatible with narrower AudioFilms use | 2000NL owns the structured details type; AudioFilms currently passes details through and does not render them in the compact overlay |
| Capability typing | compatible at runtime, drift risk | AudioFilms' local TypeScript copy uses a broad `Record<string, unknown>` for non-learning targets; payloads currently conform to the stricter 2000NL contract |

The last row is not a rollout blocker because current payloads and behavior are
compatible. It is a follow-up candidate: generate or validate the AudioFilms
consumer type from the authoritative platform schema instead of maintaining a
permissive hand copy.

## Deterministic checks

Executed on 2026-08-05 against the exact baselines above:

- 2000NL focused SenseCard suite: 8 files, 39 tests passed.
- AudioFilms dictionary suite: 14 files, 58 tests passed.
- AudioFilms extension unit smoke: passed.

These checks cover projection, independent multi-sense interaction,
translation visibility/failure, localization, Known/Undo, report targeting and
typed optional content. Responsive and visual evidence remains open below.

## Responsive and accessibility evidence

The 2000NL screenshots render the current production components through the
dev-only `/dev/sense-card-gate` regression harness. The AudioFilms screenshots
render its product-owned presentation and DOM adapters through
`scripts/fixtures/sense-card-preview.html`.

| Evidence | Scope |
| --- | --- |
| `screenshots/2000nl-desktop-face.png` | Training Face plus the complete Library single/multi, Full/Narrow and long-headword matrix with translation off |
| `screenshots/2000nl-desktop-answer-translation.png` | The same desktop matrix with Training Answer and translation visible |
| `screenshots/2000nl-mobile-training-face.png` | 390×844 Training Face viewport |
| `screenshots/2000nl-mobile-training-answer-translation.png` | 390×844 Training Answer with translation |
| `screenshots/2000nl-mobile-library-multi.png` | 390px multi-sense Library card |
| `screenshots/2000nl-mobile-library-single-off.png` | 390px single-sense Narrow card, translation off |
| `screenshots/2000nl-mobile-library-single-on.png` | 390px single-sense Narrow card, translation on and Russian UI |
| `screenshots/2000nl-mobile-long-headword-full.png` | 390px long compound in the Full Library composition |
| `screenshots/2000nl-mobile-long-headword.png` | 390px localized long compound in the Narrow composition |
| `screenshots/audiofilms-desktop-fixtures.png` | AudioFilms Full/Narrow, single/multi, translation and long-headword matrix |
| `screenshots/audiofilms-mobile-fixtures.png` | the same AudioFilms fixture at 390px |

Automated browser assertions:

- no horizontal document overflow at 1440px or 390px in either product;
- no rendered button lacks an accessible name;
- 2000NL translation toggle exposes `aria-pressed=true` after activation;
- the collapsed 2000NL meaning is keyboard-focusable and Enter changes
  `aria-expanded` from `false` to `true`;
- AudioFilms exposes labelled translation, audio and disclosure buttons; the
  explicit disclosure remains the keyboard path when the surrounding meaning
  surface also accepts pointer clicks;
- the long compound stays within its Narrow container in both products;
- its ten pronunciation segments remain single-line units, with nine explicit
  break opportunities after `·`, and neither 390px page has horizontal
  overflow.

One apparent 2000NL mobile collapse was reproduced only in a clipped slice of
an unusually tall full-page screenshot. A normal 390×844 viewport and computed
geometry showed the component correctly; the bad capture was replaced and no
product CSS change was made.

## Remaining gate evidence

- [x] Add explicit long-headword coverage to both product visual fixtures.
- [x] Capture matched Full and Narrow screenshots for `SC-01`, `SC-03`,
      `SC-06` and translation off/on.
- [x] Record keyboard/focus/accessible-name checks for the interactive fixture.
- [x] Complete independent visual QA on the exact screenshot set (PASS on
      2026-08-05; no High, Medium or Low findings).
- [ ] Record product-owner approval.
- [x] Publish rollout, rollback and follow-up decisions.

## Rollout boundary (draft)

Do not enable flags from this gate branch. Candidate rollout controls are:

- 2000NL: `NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI` and
  `NEXT_PUBLIC_PLATFORM_V2_LIBRARY_UI` (with Platform V2 lookup/actions already
  available as their own server controls).
- AudioFilms: `DICTIONARY_2000NL_SENSE_CARD_V2`.

Rollback is a flag reversal to each product's existing V1 surface. Database
state and semantic action history are retained; rollback must not rewrite
learning state.

## Rollout recommendation

Use a reversible, product-owned sequence rather than one cross-repository
switch:

1. Keep all UI flags off by default after merging this evidence.
2. Confirm Platform V2 lookup/actions health in 2000NL before exposing a V2
   consumer.
3. Enable `NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI` for the owner/test account,
   observe semantic action errors and immediately disable it on regression.
4. Enable `NEXT_PUBLIC_PLATFORM_V2_LIBRARY_UI` independently; Training success
   does not imply Library success.
5. Enable `DICTIONARY_2000NL_SENSE_CARD_V2` for the AudioFilms pilot only after
   the 2000NL provider health gate passes.
6. Expand cohorts only after each product's own smoke checks pass. Do not make
   one product's flag depend at runtime on the sibling repository.

Rollback order is the reverse of rollout. Turn off the affected consumer flag,
confirm its V1 surface, and leave Platform V2 data/action history intact. A UI
rollback must never be implemented as a database rollback.

## Explicit follow-ups

- `vbalashi/audiofilms#40`: prevent consumer-contract drift from the
  authoritative 2000NL schema.
- `vbalashi/2000nl#114`: automate this screenshot/accessibility harness after
  the manual gate proves stable; keep pixel diffs advisory initially.

The responsive gate found one implementation blocker in 2000NL: review buttons
inside a Narrow Library container used a viewport breakpoint and clipped their
labels when embedded in a wide desktop layout. The component now uses an
auto-fitting grid based on its actual available width. Re-capture shows two
columns in Narrow and four in Full, with no button text overflow.

Independent QA also found a shared long-headword defect: generic word wrapping
could split a syllable even when `displayPronunciation` supplied safe `·`
boundaries. Both renderers now keep each supplied segment intact and insert a
break opportunity only after the separator; the unsegmented fallback retains
normal emergency wrapping.
