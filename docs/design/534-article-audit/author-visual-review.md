# Author visual review — Russian wrapping supplement

This is **author review**, not independent review: the same agent created and inspected these candidates. Independent review remains the coordinator's separate gate.

Inspected actual `ru-balanced-large-on.png` and `ru-airy-large-on.png`, plus earlier full Library/Training day/night captures. Source images have identical610px capture width; comparison HTML displays them at equal CSS width. Tool thumbnails may resize different-height images differently, so perceived type size from those thumbnails is not evidence.

## Confirmed

-18 focused cases cover610px, normal/large, translations off/on/partial and all three treatments. No horizontal overflow. `russian-measurements.json` records exact text, original/translation size, line count, pair gap and rail bounds.
- In large scale the long nested example translation has three lines in all variants. The long explanation translation has three lines in Balanced/Airy; its current smaller baseline role may use fewer lines. Candidates use the same16.25px translation role at this account scale, not a nested15px exception.
- Balanced retains4px original/translation gap and Airy5px even when translation wraps to three lines. The outer idiom rail encloses the entire nested background and its text; the nested example itself intentionally has no second rail. Outer rail3px top/11px bottom in Balanced includes existing nested-wrapper8px bottom padding. This is not a clipped rail or a claim of symmetric3px ink clearance.
- Separate section labels, shared original/example typography, muted translations and nested explanation background make ownership readable in the inspected examples. Russian lines remain attached to their source instead of appearing as a new section. Equal nested example role is visibly more consistent than baseline.
- Balanced remains recommended: Airy adds164px to the full610px large translated fixture (2531→2695px) without changing text sizes. Both remain valid owner-choice alternatives.

## Design caveats to decide before production styling

1. Superseded on2026-10-03: audit candidates now use Balanced20px off/24px on-or-partial and Airy26px off/32px on-or-partial. Pair gaps remain4px/5px. Fresh measurements are required for this revised geometry.
2. Outer rail bottom clearance includes nested background padding while top clearance begins at the first source paragraph. Symmetric outer text-ink clearance is not the same as symmetric CSS padding. If symmetry is important, the nested-wrapper bottom padding must become part of the final spacing contract rather than adding another rail.
3.13px normal translation versus16px original remains intentional role hierarchy; this audit removes nesting-dependent shrink, not all size differences. Interface labels stay smaller.
4. Full browser zoom and Indigo integration remain unverified here. No production styles or grading actions were changed.

Russian provenance: meaning2 phrases follow the owner's supplied screenshot where available; other translations are explicitly author-written. Two expanded strings are layout-stress prose to exercise long Cyrillic wrapping, not approved linguistic content or provider outputs. See the fixture manifest and `russianTranslations.ts`.
