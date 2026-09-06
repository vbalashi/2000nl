# Training reading-size comparison — September 2026

This is a bounded, dev-only comparison for [#249](https://github.com/vbalashi/2000nl/issues/249).
It keeps the accepted height-B Training composition and compares only three
reading-size proposals on the same real Training frame:

`/dev/sense-card-gate?prototype=reading&variant=normal`

Use `variant=normal`, `variant=large`, or `variant=largest`. The prototype also
offers `mode=direct|reverse`, short/long deterministic local content, and
translations on/off. Add `clean=1` for a capture with the switcher hidden; the
small prototype stamp is left visible. No authentication, database, network
lookup, review action, or preference persistence is involved. The long fixture
starts with a long definition so reverse mode exercises the same content-size
pressure on its Face prompt.

## Proposed values

The values below are comparison hypotheses, not an adopted product contract.
Normal preserves the current runtime defaults. Body copy grows more strongly
than the already-large headword, while utility labels and the fixed action
dock remain unchanged.

| Role | Normal | Large | Largest |
| --- | --- | --- | --- |
| Reading body | 16px / 1.15 | 18px / 1.28 | 20px / 1.38 |
| Literary body | 16px / 1.4 | 18px / 1.5 | 20px / 1.55 |
| Compact idiom | 14px / 1.25 | 15.5px / 1.35 | 17px / 1.4 |
| Nested definition | 13px / 1.35 | 14px / 1.4 | 15px / 1.45 |
| Translation | 13px / 1.35 | 14px / 1.45 | 15px / 1.5 |
| Headword (face / answer) | 48px / 44px | 50px / 46px | 52px / 48px |
| Headword translation | 15px | 16px | 17px |
| Long headword (narrow / wide) | 32px / 40px | 34px / 42px | 36px / 44px |
| Article (face / answer) | 24px / 20px | 25px / 21px | 26px / 22px |
| Reverse prompt | clamp(1.55rem, 5cqi, 2.4rem) | clamp(1.7rem, 5.4cqi, 2.55rem) | clamp(1.85rem, 5.8cqi, 2.7rem) |
| Utility labels | unchanged | unchanged | unchanged |

The prototype intentionally leaves the action dock height and session/footer
geometry owned by the accepted B runtime. If larger body text increases scroll
pressure or makes controls hard to reach, record that as comparison evidence;
do not conceal it by changing the runtime dock height.

This is not a settings feature or a production rollout. Once the comparison has
a decision, retain the decision in the issue and remove or absorb this throwaway
surface.

## Comparison and evidence — 2026-09-06

[Open the screenshot comparison](comparison.html). These are actual rendered
components, not a second mock card renderer. Fixture translations are Russian;
controls are Dutch. The toolbar/stamp explicitly identifies the prototype.

Source: `ac0ef784` (implementation `9d0e2da8`, review fixes `ac0ef784`).
Base: `9effb923`, whose complete tree equals deployed main `2082b0b8`
(release `0.18.516`). This experiment is **not deployed**.

Independent Luna Spec and Standards re-reviews found no remaining source-code
findings after the fixes. This does not approve all visual states.

Typecheck and lint pass; full unit/component suite: **908 passed / 123 skipped**.
The skipped DB-dependent tests were not exercised: this is fixture-only visual
QA, with no live Supabase, provider calls, auth, or learning-state mutations.

Browser test: `apps/ui/playwright/tests/training-reading-size-study.spec.ts`.
Final source run: **22 passed**, Chromium, reduced motion, loaded local fonts.
The browser tests verify computed sizes, actual Newsreader family, Report/Known
alignment, fixed controls, internal Answer scrolling, reveal/translation, and
prototype controls. Six reverse tests capture containment separately: their
pass status proves capture/reveal, **not absence of clipping**.

| Captured state | Viewport / theme | Sizes | Result / acceptance |
| --- | --- | --- | --- |
| Direct Face → Answer → translated Answer | 390×844 and 1440×960; light + dark | all three | Captured; measured controls stable, owner size choice pending |
| Long translated Answer, scrolled | 320×568; dark | all three | Internal scrolling works; pinned word/dock stable; reading region is small |
| Long reverse Face → Answer | 390×844; dark | all three | Prompt contained, reveal reachable; owner choice pending |
| Long reverse Face → Answer | 320×568; dark | Normal | Prompt contained for this fixture |
| Long reverse Face → Answer | 320×568; dark | Large / Largest | **Gap: prompt clipped, no Face scroll; do not adopt yet** |
| Tablet, landscape, OS text scaling/200% zoom, long headword, hint overlay, audio-only, waiting/error | — | — | Not covered by this study; not approved implicitly |

Exact narrow reverse measurements: shell y=126…428px. Prompt bottom is 398px
(Normal), 476.875px (Large), and 542.03125px (Largest). Therefore Large loses
about 49px and Largest 114px below the shell. The default Normal fixture is
not clipped; this finding must not be reported as a proven current-production
failure. Fix overflow/reachability before a larger preset is adopted; do not
shrink the font silently or change the accepted B dock to hide the problem.
The follow-up remains tracked in #249 / #251.

Current captures live under `assets/`, named
`{phone|desktop}-{light|dark}-{normal|large|largest}-{face|answer|translated}.png`,
plus `narrow-dark-*-long-scrolled.png` and
`{phone|narrow}-dark-*-reverse-long.png` (45 screenshots in total).

Capture tooling limitation: the `agent-browser` screenshot call stalled. The
in-app Browser opened the real prototype successfully, but its returned API
did not expose equal-viewport capture here. An isolated Playwright browser
produced these deterministic screenshots; it did not reuse an account/profile.

Next owner review is intentionally small: compare **Normal vs Large** on the
same phone Answer. Large is a candidate, not a new default. Resolve narrow
reverse overflow and expand the agreed coverage before implementing a saved
reading-size preference. No new ADR or Pen approval was created by this study.

Independent screenshot QA confirmed the same B frame in the three phone
comparisons and recommends Normal → Large as the first comparison. It also
flags that the centered continuation affordance occupies part of the faded
bottom text region (already visible in Normal); with larger sizes, less of the
next section is visible before scrolling. Reassess that affordance/readability
with the overflow follow-up, rather than counting successful scrolling as
proof that the presentation is fully accepted. The Large session-strip concern
raised in the first review was withdrawn after checking the exact saved image;
its session strip is present and aligned with the other variants.
