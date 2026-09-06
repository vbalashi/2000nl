# Training reading-size comparison — revision 2, 2026-09-06

Dev-only study for [#249](https://github.com/vbalashi/2000nl/issues/249),
draft [#263](https://github.com/vbalashi/2000nl/pull/263). Uses actual shared
Training components, not a second card renderer. B is deployed; this study
and its corrections are **not deployed**.

Open `/dev/sense-card-gate?prototype=reading&variant=large` locally.
Controls select Normal/Large/Largest, direct/reverse, short/long/long-word,
translations and theme. `clean=1` hides controls with a recoverable stamp.
No auth, DB, provider calls, grading or preference persistence.
Long-word reuses an artificial gate fixture: layout evidence, not lexical QA.

## Current proposed values

These are comparison hypotheses, not owner-approved presets or a new default.

| Role | Normal | Large | Largest |
| --- | --- | --- | --- |
| Reading body: size / line height | 16px / 1.15 | 18px / 1.28 | 20px / 1.38 |
| Examples, usage, idioms | 16px / 1.4 | 18px / 1.5 | 20px / 1.55 |
| Nested definition | 13px / 1.35 | 14px / 1.4 | 15px / 1.45 |
| Translation | 13px / 1.35 | 14px / 1.45 | 15px / 1.5 |
| Headword Face / Answer | 48px / 44px | 50px / 46px | 52px / 48px |
| Article Face / Answer | 24px / 22px | 25px / 23px | 26px / 24px |
| Long headword below / from 640px | 32px / 40px | 34px / 42px | 36px / 44px |
| Any training article | 0.5 × actual word | 0.5 × actual word | 0.5 × actual word |
| Headword translation | 15px | 16px | 17px |
| Reverse prompt | clamp(1.55rem, 5cqi, 2.4rem) | clamp(1.7rem, 5.4cqi, 2.55rem) | clamp(1.85rem, 5.8cqi, 2.7rem) |
| Footer below / from 768px | 10.5px / 11px | 10.5px / 11px | 10.5px / 11px |

Revision 2 removes the compact-idiom exception: examples, usage and idiom lines
share one literary role. Nested definitions/translations retain distinct roles.
Article inherits half the actual word, including long words.
Mobile footer uses spare width and 10.5px instead of 9px, retaining one line
and its 44px + safe-area height. Dock and action hit areas are unchanged.

## Small-screen correction

Revision 1 clipped Large/Largest reverse prompts at 320×568. Face now has a
named, focusable native scroll region. If content does not fit, scroll inside
the card; both ends remain reachable. Hint is in flow below the prompt, not an
overlay. Focused Space scrolls rather than reveals; Home/End and wheel work.
Fixed actions stay outside. Selected reading text is not silently shrunk.

Partial initial content is expected when overflowing, not inaccessible clipping.
At 320px footer labels can ellipsize; fixture counts remain visible. This still
needs owner review with longer numbers and other languages.

## Evidence and verification

Final source: `248f7af8` (runtime `fc304fac`, subsequent test/dev corrections).
Base `9effb923` has the exact tree of main `2082b0b8`, release `0.18.516`.
No production or personal-account actions in this revision.

Browser suite: `apps/ui/playwright/tests/training-reading-size-study.spec.ts`.
Chromium, equal viewports, reduced motion, loaded fonts, animations disabled
for screenshots. Fixture tests block cross-origin and API calls.

| State | Viewport / theme | Sizes | Checks |
| --- | --- | --- | --- |
| Face → Answer → translated Answer | 390×844, 1440×960; light/dark | all three | Computed typography, Report/Known and fixed controls |
| Long translated Answer, scrolled | 320×568; dark | all three | Internal scroll, pinned word/actions |
| Long reverse Face, initial and end | 390×844, 320×568; dark | all three | End reachable, prompt top recoverable, reveal reachable |
| Long reverse with hint | 320×568; dark | Largest | Hint below prompt; keyboard/scroll |
| Long word Face and Answer | 390×844, 768×844; dark | all three | Ratio 0.5, no horizontal document overflow |
| OS scaling/200% zoom, real Safari/mobile device, landscape, audio-only, waiting/error | — | — | Not covered; not implicitly approved |

Independent Luna Spec/Standards reviews cover this correction slice. Review
requests for long-word coverage and its missing toolbar option were addressed.
Full unit/component suite: **908 passed / 123 skipped** (DB coverage not run).
Typecheck/lint pass. Final source browser run: **35 passed**, 63 screenshots.
The PR checkpoint links the evidence commit. Tests do not constitute visual acceptance.

[Screenshot comparison](comparison.html) uses `assets/r2/`: 63 actual screenshots.
Original 45 captures and `comparison.png` remain revision 1 history, not current
results. Original report: commit `e1c36fcf`.
Revision 2 HTML links were checked without reopening the file in a browser;
the actual HTTP development gallery remains the interactive review surface.

## Remaining decisions

- Choose preset values; 16→18px is 12.5%, 16→20px is 25%.
- Reassess the continuation affordance over faded lower Answer text. Larger
  copy reduces visible space; scroll success alone is not visual acceptance.
- Approve further responsive/accessibility coverage before persisted settings.
- No new ADR, automatic Pen approval or complete #249/#251 acceptance claim.

Separate diagnosed work: #252 removes actively reached old Word Details from
single-sense Library and Training; #264 establishes one stable app frame.
Neither is fixed by this typography slice.
