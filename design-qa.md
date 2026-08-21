# Design QA — Training v1.0 approved subset (#194)

## Comparison target

- Source visual truth:
  - `/Users/khrustal/dev/docs/design/2000nl-audiofilms/training-v1.0/face.png` (Pencil `k4unJX`)
  - `/Users/khrustal/dev/docs/design/2000nl-audiofilms/training-v1.0/answer.png` (Pencil `twUIm`)
  - `/Users/khrustal/dev/docs/design/2000nl-audiofilms/training-v1.0/long-idiom.png` (Pencil `lkphz`)
  - `/Users/khrustal/dev/docs/design/2000nl-audiofilms/training-v1.0/recoverable-error.png` (Pencil `ZprWV`)
- Browser-rendered implementation screenshots:
  - `artifacts/design-qa/training-face-402x874.png`
  - `artifacts/design-qa/training-answer-402x874.png`
  - `artifacts/design-qa/training-long-idiom-402x874.png`
  - `artifacts/design-qa/training-error-402x874.png`
  - responsive/theme evidence: `training-{face,answer,long-idiom,recoverable-error}-{light-mobile,dark-wide}.png` in the same directory
- Full-view comparison evidence: `artifacts/design-qa/training-v1-comparison.png` (source left, implementation right for all four states).
- Viewport: 402 × 874 CSS px, dark scheme, device scale factor 1. Every state also has containment/contrast evidence at 402 × 874 light and 1280 × 900 dark.
- State: authenticated pilot Training session, direct word-to-definition card, Dutch interface, `bank` face, translated `bank` answer, `nodig` long-idiom answer, and recoverable invalid-model error.

## Density normalization

Pencil MCP reports every authoritative screen node as exactly 402 × 874 logical px. The committed PNG exports are 806 × 1750 px because they are 2× rasters that include the outer one-pixel stroke at export density; this is not a 403 × 875 logical viewport. Runtime screenshots are 402 × 874 px at device scale factor 1. For the combined comparison, each complete 806 × 1750 source export was normalized to 402 × 874 without cropping, then paired with the corresponding 402 × 874 runtime capture.

## Browser choice and capture path

The integrated Pencil browser was available and was used to read the authoritative node dimensions and component geometry. The unavailable surface was specifically request-route interception/test-fixture injection, which is needed to make the four Training states deterministic without touching real learning data. Therefore exact-state runtime capture used the repository's standalone Playwright harness with mocked platform/Supabase routes, the visual-only fallback permitted by `nl-local-ui-qa`. This does not mean the integrated browser itself was unavailable.

The fixture uses a synthetic authenticated identity and performs no real user or learning mutations. Primary interactions tested were starting the current selection, advancing nine mocked card actions to the approved `10 / 23` position, revealing the answer, toggling translation, opening the real History destination in focused tests, and rendering the recoverable-error state. The run produced no unexpected browser-console or page errors; only the development toolchain's existing dependency-age/deprecation warnings were printed by the test runner.

## Focused-region evidence

No additional cropped comparison was necessary after the final full-view contact sheet: at 804 px paired width, the card header controls, typography, content hierarchy, action docks, footer stats, and error actions remain readable. The focused individual implementation captures listed above were also opened at native 402 × 874 resolution while iterating.

## Required fidelity surfaces

- Fonts and typography: reusable Inter/Newsreader/Geist Mono owners are used. Headword scale, semantic metadata, section hierarchy, long-idiom line treatment, and compact footer type were checked. The application correctly localizes Dutch UI labels; Pen's mixed English CTA/review/error labels are not hardcoded over runtime message-key policy.
- Spacing and layout rhythm: 10 px outer frame, 58 px app header, compact session block, 14 px card radius, 18 px card padding, separate scrolling card body, stable Face/Answer docks, 44 px footer, and error-only full card were checked against all four nodes.
- Colors and tokens: approved dark surface, border, muted text, accent, green, amber, red, and review colors map to shared runtime classes. All four states were checked in light/mobile and dark/wide profiles; footer tracks and values use explicit light/dark tokens.
- Image and asset fidelity: the approved subset has no photographic/raster content inside the UI. Existing BrandLogo and Lucide icons are reused for every certified visible icon, including audio, translation, More, hint, check, chevron, exposure, and section markers; a component assertion rejects non-Lucide SVGs on both sides.
- Copy and content: deterministic `bank` and `nodig` fixtures match source dictionary content. Dutch interface labels intentionally follow the selected-language catalogs, so Pen's mixed English CTA/review/error copy remains localized at runtime. The default direct-understanding scenario is implicit, matching the approved `Nieuw + herhaling`; non-default modes/scenarios remain explicit and covered. The visual fixture returns the merged authoritative plan and advances through real mocked actions, so the ordinal, total, and bar now represent `10 / 23` rather than a derived stats sum.
- Interaction/accessibility: visible actions remain semantic buttons with labels and focus rings. Direct Face audio remains top-right, Answer audio remains in the answer header, reverse Face stays quiet, and global Melden/Mark Known remain the only secondary actions. The approved History icon now uses the merged authoritative destination handler and stable focus-return ref; it is omitted only when no handler exists, preventing a dead control. Mobile controls do not clip; desktop keeps the body bounded and docks stable.

## Comparison history

1. Initial comparison — blocked.
   - P1: runtime captures contained a development database warning and Russian/synthetic copy, so state and viewport did not match.
   - P1: outer frame, card bounds, app/session chrome, audio location, answer metadata actions, docks, footer, and recoverable-error composition differed.
   - Fixes: added capability-complete deterministic Dutch visual fixtures; suppressed only the fixture-inapplicable health warning; implemented shared session header/chrome/footer/card primitives; moved direct Face audio and Answer controls; separated body scrolling from stable docks.
   - Evidence: first 402 × 874 Face/Answer/Error captures and focused component assertions.
2. Second comparison — blocked.
   - P1: Answer omitted entry and definition translations; POS rendered long-form; error still showed session chrome/footer; long idiom was not captured.
   - Fixes: rendered the approved translation state, introduced compact visual POS labels while retaining the full semantic title, made the failure state suppress session detail/footer, and added an exact-state long-idiom fixture/capture.
   - Evidence: four-state Playwright suite and updated individual captures.
3. Third comparison — blocked.
   - P1: long-idiom children had per-line nested accent bars and incorrect indentation; error card reserved footer space; Answer and idiom vertical rhythm/wrapping drifted.
   - Fixes: made each idiom one reusable accented block, aligned nested text, removed failure-only bottom reservation, expanded the error card to the outer inset, tightened answer header/content rhythm, and adjusted example/idiom optical sizes.
   - Evidence: final `artifacts/design-qa/training-v1-comparison.png` plus native individual captures.
4. Pre-review comparison — passed, then reopened by Standards + Spec review.
   - No actionable P0/P1/P2 visual differences remain in #194 scope.
   - Expected dynamic/localization differences are documented above and must not be replaced with fixture-specific product code.

5. Standards + Spec remediation comparison — reopened.
   - Session chrome consumes only the authoritative ordinal; invented ratio/progress were removed and #224 owns a future server contract.
   - Certified icons use Lucide; the identical `IconButton.compact` prop/branch was removed.
   - A typed `TrainingVisualState` profile module owns the four valid fixtures, including English entry and definition translation targets; combinable visual booleans were removed from the attribution harness.
   - A declarative failure-only layout selector suppresses session detail in the same committed error state. The error first-paint observer found no visible session chrome/footer, while the loading regression proves the existing chrome/footer remain present; #193 loading UX is unchanged.
   - History renders only when an authoritative handler exists; production omits the dead control and #225 owns the destination.
   - Visual fixtures now return canonical `PlatformHeadwordGroupV2`, use `PlatformSenseCardCapabilityV2[]`, and type idiom content as `PlatformContentNodeV2[]`.
   - Session copy projects localized scenario, card filter, and any non-default mode rather than claiming every session is mixed. New-only, review-only, mixed, and reverse cases have focused coverage.
   - All four states were recaptured at exact 402 × 874 dark, 402 × 874 light, and 1280 × 900 dark. There is no light Pen source, so light evidence certifies contrast/containment rather than pixel equivalence.

6. Dependency integration comparison — passed.
   - #224 now supplies the server-owned planned total. `TrainingSessionChrome` renders the accepted presentation position/total/fraction, restoring the approved `10 / 23` count and progress bar without deriving a total from footer statistics.
   - #225 now supplies the real History destination and focus-return seam. The approved Lucide History control is visible, operable, and no longer decorative.
   - The default direct-understanding label is intentionally implicit to match Pen, while new-only, review-only, mixed, reverse, and non-default scenarios remain semantically projected by the shared label owner.
   - History icon placement, ratio pill, progress track, four card/error compositions, and stable docks were compared in the refreshed contact sheet. No actionable P0/P1/P2 visual difference remains. Remaining copy differences are required Dutch localization, not geometry regressions.

At the dependency-integration checkpoint, the #194 code slice and #224/#225 were visually complete: all approved chrome was backed by authoritative runtime behavior.

7. Architecture remediation comparison — visually passed; architecture rereview pending.
   - A typed `TrainingSessionV2Layout` now owns loading, ready, and failure composition in the same render. Loading/ready receive chrome and footer slots; every known failure and any unknown future renderer state fail closed to the error-only composition. The broad negative DOM `:has(...)` selector was removed.
   - Session presentation is one discriminated snapshot: ordinal-only or authoritative planned progress. There are no competing `position` and `progress.position` inputs.
   - Each visual profile is built once as one immutable typed bundle containing canonical Platform V2 lookup groups plus its plan, stats, and settings. The harness consumes that bundle rather than reconstructing visual state across routes.
   - All four exact 402 × 874 dark states and the light/mobile plus dark/wide profiles were recaptured after the DOM ownership change. The refreshed contact sheet shows unchanged approved geometry and no new P0/P1/P2 visual difference.

Design fidelity remains passed, but the overall gate is intentionally blocked until the requested independent architecture and spec rereviews confirm these seams.

8. Swipe interaction remediation — visually passed; spec rereview pending.
   - The V2 session now owns answer-side swipe state and resolves the exact server-provided `fail`/`success` review capabilities. It does not route V2 gestures through the legacy review mutation.
   - `TrainingSessionV2Layout` exposes one typed ready-only interaction surface for the card ref, transform, touch lifecycle, and feedback. Loading and every failure phase omit that surface by construction; Face remains non-swipeable and busy actions remain single-flight.
   - Component/session tests cover the 35% commit threshold, Face suppression, below-threshold cancel/reset, visible transform feedback, canonical review action selection, and busy suppression.
   - The four authoritative dark states and responsive light/wide profiles were recaptured after the wrapper gained its ready-only event/style port. Resting-state pixels retain the approved geometry; no new P0/P1/P2 visual difference was found.

P3 follow-up polish:

- The runtime BrandLogo's glyph metrics differ slightly from the Pencil raster because the product's real font rendering is retained; hierarchy and header geometry are preserved.
- The progress fill follows the authoritative `10 / 23` fraction; subpixel rasterization can differ by a pixel from the 2× Pen export while the track and pill geometry remain aligned.

## Validation

- Focused component/session/layout/fixture suites: 132 / 132 passed, including authoritative progress, History navigation/focus return, loading retention, fail-closed layout ownership, semantic-label cases, and V2 swipe threshold/cancel/busy behavior.
- Full UI unit suite: 881 passed, 120 skipped (environment-gated RPC tests), 0 failed.
- Exact-state visual browser suite: 4 / 4 passed.
- TypeScript typecheck: passed.
- Lint: passed.
- Optimized Next.js compile/type validation: passed; static export then stopped on the known local-environment prerequisite `Supabase credentials are not configured` for auth/root pages, unrelated to this UI slice.

final result: blocked — architecture and spec rereviews pending
