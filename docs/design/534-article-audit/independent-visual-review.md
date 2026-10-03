# Independent evidence review — 2026-10-03

Reviewer inspected Balanced/Airy610px off/on, Russian Balanced large-on, Library light-on and Training dark-on captures; checked CSV nested examples and Russian JSON. No production styles were changed. This is an evidence review, not owner approval or verification of final integrated application styling.

Confirmed baseline nested example14px/20.3px versus ordinary example16px/22.4px. Both proposals remove that nesting-dependent mismatch. Translation grouping and nested explanation backgrounds are readable in inspected captures; no overlapping text was observed. Balanced offers the same typography with less scrolling than Airy.

Initial findings: comparison did not expose Russian screenshots despite report wording; screenshots included a developer indicator obscuring text; conditional larger section separation with translations was absent. Audit revision now addresses these: Russian controls, clean captures, Balanced20off/24on-or-partial and Airy26off/32on-or-partial, pair gaps4/5px. Because this reviewer subsequently amended audit artifacts, the revised candidates require a separate post-implementation independent review.

Remaining gates: owner variant selection, final production implementation, repeated container/theme/reflow geometry after conditional-spacing change, native browser zoom, integrated Indigo. Historical container images remain explicitly labelled previous geometry. Authored Russian layout-stress strings prove wrapping only, not linguistic accuracy or provider responses. Section margins are computed CSS measurements; they must not be described as all actual ink-to-ink gaps.
