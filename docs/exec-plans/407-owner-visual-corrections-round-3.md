# Owner visual corrections — round 3

2026-10-01. Presentation owner: apps/ui. Local prototype source: app/dev/session-builder-prototype/library.module.css (headword, 32px controls, full-height sheet entry). No lookup or learning-state contract changes.

## Ranked owner comments

| Priority | Comments | Result |
|---|---|---|
| 1 | 2–6 | Sheet slides from below viewport; article headword uses explicit theme size (36px normal); metadata centers with 32px actions; translation control stays visible with an explanation when translation is off. |
| 2 | 9 | Only Language and Source rows. Dictionaries and collections share Source; distinct typed IDs prevent collisions; canonical collection query/count retained. |
| 3 | 1 | Copy footer hidden in approved Library. Existing legacy/service behavior retained. |
| 4 | 7 | Floating previous / page / next pill in one row; secondary text replaces danger color. |
| 5 | 10 | Mobile calendar window is three months; accessible label updated in all locales. Future dates are not fabricated. |
| 6 | 8 | Final saved training row has no separator. |

## Verification

Typecheck; focused component/client tests; lint (existing TrainingSenseCardV2Session handlePlayAudio warning). Browser at 472×954: actual aandoening article font 36px; 32px controls; visible disabled translation with localized explanation; no copy footer; compact single-row pagination; Language/Source main filter; dictionary and VanDale 2k collection in Source; August–October activity window.

Evidence: /Users/khrustal/adhoc/2000nl-407-visual-evidence/r3-library-card.png.

Why inconsistent: production had retained 40px shared Training controls and a 20px/opacity entry animation instead of the Library prototype's 32px controls and full-height slide. Article headword relied on inherited 1em rather than its direct article size token. Separate collection row was an implementation mistake, removed.

Owner visual approval remains open. Prior action-history undo policy remains a separate case.
