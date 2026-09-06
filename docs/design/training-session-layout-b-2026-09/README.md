# Training session — accepted height B in the runtime

Owner: [#251](https://github.com/vbalashi/2000nl/issues/251), responsive
contract [#249](https://github.com/vbalashi/2000nl/issues/249).
Base `e2329fa3197a7f1082c64e364a654c718a533b9e` (PR #260); runtime
`b7eecdd70a489d553bd37013e9db86ca75704651` (initial layout `46eaf3de`).
This slice follows #258 typography and #260 secondary actions.
It does not complete all of #251 and is not a production-deployment receipt.

## Accepted and implemented

The owner accepted B and then explicitly approved the quiet, single-line
session name without the separate “Training” label. The real Training route
now uses that composition; the temporary renderer from draft #259 is not
part of this branch and must not be merged as a second runtime.

| Region | Contract in this slice |
| --- | --- |
| Application header | 58px plus top safe area; logo, existing Theme/Settings actions; same theme surface as surroundings |
| Session row | Same width as card, 48px high; name, unchanged position/progress, History and Close |
| Session typography | Inter, name 0.75rem/500; position 0.6875rem with tabular numbers; one line |
| Card stack | Up to 760px wide; fills remaining height, no desktop max-height |
| Outer vertical space | 10px phone/short window; 40px when width ≥768px and height ≥700px |
| Horizontal space | 16px below 768px; at least 24px on wider screens |
| Session → card gap | 10px |
| Fixed vs scrolling | Metadata/headword/translation and action dock stay fixed; long Answer body scrolls internally |
| Footer | 44px plus bottom safe area; label, bar and value on one line; meanings/count calculations unchanged |
| Footer typography | 0.5625rem below 768px, 0.6875rem above; not coupled to future reading size |

The 768px/700px switches are implementation choices verified below, not numbers
claimed to have been measured in Pen. On short windows the layout spends space
on content instead of the 40px outer margins. Safe-area expressions are present;
physical notched-device/browser-toolbar testing remains open.

## Ownership and removal

- `TrainingSessionLayout.module.css` owns the adopted session geometry and
  theme values, including the compact footer. No global typography override.
- `TrainingSessionV2Layout` owns the stack and its loading/ready/failure phases.
- `TrainingSessionChrome` owns the name/progress and session actions;
  `AppUtilityNav` retains the existing Theme/Settings behavior.
- `TrainingScreen` wires those owners. Unreachable old V2 styling in its
  fallback branch was removed. The reachable non-V2/listening route was not
  deleted speculatively; its migration remains outside this slice.
- Loading now fills the same available area. Failure retains its existing
  recovery/exit controls and does not expose ratings.
- No controller, FSRS, count semantics, Report behavior, identity or DB changes.
- The root theme belongs to the displayed V2 layout, independently of whether
  Today setup/session chrome is enabled. A regression test reproduced the missing
  theme owner when setup was disabled; `b7eecdd7` fixes that configuration.

## Verification

At runtime commit `b7eecdd70a489d553bd37013e9db86ca75704651`:

- Typecheck/lint passed; full suite **908 passed, 123 DB-dependent skipped**.
- New tests first reproduced the old “Training” eyebrow, then passed with the
  accepted name-only row. Initial focused layout/Chrome/TrainingScreen suite:
  83 passed; final full suite also includes the setup-disabled theme regression.
- Browser suite **13/13 passed**, real TrainingScreen/Stage, real Inter/Newsreader.
  Ten width/theme cases each cover Face and Answer, geometry, pinned footer,
  session and app controls, and Close → Today. Three additional cases cover
  long translated content, History/Settings/theme return, and recoverable failure.
- Independent Standards/architecture/refactoring review: no material findings.
- Independent Spec review: no remaining material blocker or scope creep after
  the setup-disabled theme fix. That configuration has an ownership regression
  test, not a separate computed-color browser capture; browser evidence is pilot.
- Independent whole-frame visual review: no material blockers in supplied frames.

Browser transport uses the existing deterministic attribution fixture with
synthetic `test@2000nl.test`, not a personal account or real authentication.
Unhandled API/external requests are blocked. Mock health is not DB-health
evidence. No DB/learning-state writes or production checks were performed.
This is not physical-device, Safari, all-language or full WCAG acceptance.

Run `APP_ROLLOUT_PROFILE=pilot npx playwright test
playwright/tests/training-session-layout-b.spec.ts` from `apps/ui`, with canonical
3100 available. For real-font captures reuse the fixture-only pilot server on
3100 with a test config that disables the standard mocked-font webServer.

| Viewport | Dark Face / Answer | Light Face / Answer |
| --- | --- | --- |
| 390×844 | [Face](assets/phone-dark-face.png) / [Answer](assets/phone-dark-answer.png) | [Face](assets/phone-light-face.png) / [Answer](assets/phone-light-answer.png) |
| 834×1112 | [Face](assets/tablet-dark-face.png) / [Answer](assets/tablet-dark-answer.png) | [Face](assets/tablet-light-face.png) / [Answer](assets/tablet-light-answer.png) |
| 1440×960 | [Face](assets/desktop-dark-face.png) / [Answer](assets/desktop-dark-answer.png) | [Face](assets/desktop-light-face.png) / [Answer](assets/desktop-light-answer.png) |
| 1024×600 | [Face](assets/short-dark-face.png) / [Answer](assets/short-dark-answer.png) | [Face](assets/short-light-face.png) / [Answer](assets/short-light-answer.png) |
| 320×568 | [Face](assets/narrow-dark-face.png) / [Answer](assets/narrow-dark-answer.png) | [Face](assets/narrow-light-face.png) / [Answer](assets/narrow-light-answer.png) |

[Long translated content after scrolling](assets/narrow-dark-scrolled-translation.png)
and [recoverable failure](assets/phone-light-failure.png).

## Reading sizes: prepare now, compare next

Recommendation, not yet an approved font-size contract: start with **three**
presets (normal, large, very large), chosen by the reader rather than Retina
detection. Use separate roles: headword/article, reading body (definitions,
examples, translations, notes), and utility labels. Grow reading body more than
headword and utility labels; do not multiply the entire card by one scale.

This slice only separates session utility sizes into owned variables. Card-wide
reading tokens, actual preset values, a setting and persistence are **not yet
implemented**. The next bounded #249 comparison should render the same real
Face/Answer with long text, translations, both themes and small/large viewports
at three proposed sizes. Check dock reachability, wrapping and remaining scroll
space before adopting values. Fixed Face overflow and fixed dock heights need
particular attention. The current default reading typography remains #258.

Browser zoom must remain usable independently of an app setting. W3C discusses
[200% text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text)
and [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html); the
320px fixture check here is only one piece of that verification, not certification.
No new ADR or settings feature is needed to choose the next visual comparison.
