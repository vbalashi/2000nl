# Full-screen height study — 2026-09-06

Owner: [#249](https://github.com/vbalashi/2000nl/issues/249).
Runtime adoption: [#251](https://github.com/vbalashi/2000nl/issues/251).
Base: PR #258, `3a41dd552a86ee8651b17a4c6e897020c2d72389`.

Question: should the width-bounded tablet/desktop interaction stack use all
available height or have modest extra space above/below? Phone uses the full
available height in both variants. This is not an approved responsive contract.

## Run / inspect

From `apps/ui`, with dependencies installed:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open `/dev/sense-card-gate?prototype=height&device=phone&variant=full`.
The existing route without `prototype=height` is unchanged. Production keeps
its existing unavailable guard. No real auth, API or learning mutations are
needed; this is a deterministic component gallery, not DB-connected Training QA.
The inherited root layout still mounts its standard feedback-outbox bootstrap;
use a fresh browser context for automated captures so no prior local queued
reports or authentication state can be replayed. Do not use a real-user context.

- Device selector: phone 390×844, tablet 834×1112, desktop 1440×960.
- A / `variant=full`: phone 10 px outer top/bottom; tablet/desktop 12 px.
- B / `variant=inset`: phone remains 10 px; tablet/desktop 40 px.
- Side, theme, content selectors; A/B and arrow-key switcher update URL.
- `canvas=1`: just the full app-shaped screen, without review controls.
- Long-content fixture repeats eight illustrative sentences three times to
  force internal scrolling. It is a stress fixture, not dictionary content.
- The table below the screen receives actual child-frame measurements.

The app header, session strip and one-line stats here are **prototype-only**
surroundings. They show earlier owner directions (theme/settings above,
History/Close next to session, one-line footer), but do not implement those
features in Training. Numbers are example data, not queue/catalog semantics.
Non-core controls show a dismissible temporary notice instead of mutating data.

## Ownership / source versus proposals

The card is imported `TrainingSenseCardStage` from PR #258: real content,
headword, actions, translation reveal, internal scroll/fades, Face/Answer.
No card renderer is copied or overridden. `BrandLogo` is also reused.

| Parameter | Study value | Provenance / state |
| --- | --- | --- |
| Maximum card/stack width | 760 px | Existing Stage and Pen 30.90.07; not new width approval |
| Outer horizontal space | 16 px phone; 24 px wide | Comparison candidate; phone matches 30.90.07 |
| Wide-layout threshold | 768 CSS px | Comparison candidate, not final breakpoint |
| App header / stats footer | 58 / 44 px + device safe areas | Candidate composition; production still unchanged |
| Session row / following gap | 48 / 10 px | Candidate; same in A and B |
| A top/bottom outer space | 10 mobile / 12 wide | Candidate |
| B top/bottom outer space | 10 mobile / 40 wide | Candidate |
| Answer type / inner geometry | PR #258 M2/M3/M6 | Previously approved small implementation slice |

Historical source inspected read-only through Pencil on 2026-09-06:
`Oiksc` / 30.90 responsive board, `wgbA7` / desktop scrolled Answer and
`k8GreD` / mobile scrolled Answer. Desktop source was 1440×960, card 760×500,
header 68, session bar 960×42, dock 760×76, footer 72. Mobile source was
390×844, card 358×542, header 58, session 358×38, dock 358×104, footer 56.
Those older heights are not copied into the new candidates: the owner's latest
clarification explicitly reopened desktop height and asked for a comparison.
Pen was not edited; no new ADR was created.

## Measurement checkpoint

Measured inside the real iframe (CSS pixels, Answer, no translation):

| Screen / option | Card | Session + card + dock | Outer top/bottom |
| --- | --- | --- | --- |
| Phone 390×844, A/B | 358×534 | 722 px | 10/10 |
| Tablet 834×1112, A | 760×842 | 986 px | 12/12 |
| Tablet 834×1112, B | 760×786 | 930 px | 40/40 |
| Desktop 1440×960, A | 760×690 | 834 px | 12/12 |
| Desktop 1440×960, B | 760×634 | 778 px | 40/40 |

Typecheck and lint passed, including the theme-cleanup correction from the
independent static review. In the long desktop B fixture, the reading area was
504 px high for 1065 px of content. Its actual continuation button moved scroll
position from 0 to 327.78 px while headword top stayed 217.0486 px; the top fade
changed from clear to faded. The full-screen layout does not rely on scrolling
the outer app to reach content. No production card source was changed.

The initial in-app screenshot surface distorted scale/crops at its current
zoom; those images are not acceptance evidence. The owner subsequently
authorized any browser. Clean captures now use Chromium in a fresh isolated
context per case, without authentication, storage reuse or service workers.
The runner blocks external origins and `/api/` requests; none were attempted.

Reproduce from repository root with the local gallery running:

```sh
node docs/design/training-height-2026-09/capture.cjs
```

All six device/height cases passed: exact viewport/card dimensions, no outer
document overflow, action dock above footer, real Inter/Newsreader fonts loaded,
internal scrolling with stationary headword/dock, Face → Answer and translation
reveal. No page JavaScript errors were observed. The 24 screenshots cover dark
Answer, light Answer, dark Face and scrolled long Answer for every case.
See [machine-readable evidence](capture-evidence.json) for the source commit,
geometry and final scroll positions. This is Chromium fixture QA, not real
mobile browser/safe-area, keyboard, authenticated Training or database QA.

| View | A: maximum height | B: more space around stack |
| --- | --- | --- |
| Phone (identical geometry) | [Screenshot](assets/phone-full-answer-dark.png) | [Screenshot](assets/phone-inset-answer-dark.png) |
| Tablet | [Screenshot](assets/tablet-full-answer-dark.png) | [Screenshot](assets/tablet-inset-answer-dark.png) |
| Desktop | [Screenshot](assets/desktop-full-answer-dark.png) | [Screenshot](assets/desktop-inset-answer-dark.png) |

Owner choice of tablet/desktop height remains pending. Clean screenshots and
review do not constitute approval of every surrounding control or typography
detail, and no production rollout has occurred.

Independent visual review inspected all 24 PNGs and found no material clipping,
fixed-control, theme or composition blockers at these six viewports. Phone A/B
are visually identical. Reviewer and primary agent tentatively prefer B on
tablet/desktop for the modest surrounding space; this is a recommendation, not
owner approval. Muted Report/Known labels remain low-emphasis; their complete
contrast and interaction acceptance belongs to the production UI contract.

## Retirement

After the owner chooses geometry, transfer only the accepted numbers and
behavior into #249's matrix and tested production components through #251.
Delete `HeightPrototype.tsx`, its CSS and the `prototype=height` page branch.
Keep this receipt and selected images as history; do not merge an enduring
second implementation of the session chrome.
