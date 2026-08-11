# SenseCard visual contract matrix

This is the compact implementation lookup for `vbalashi/2000nl#79`. It is not
a second backlog. GitHub owns work state; Pen owns visual evidence.

## Precedence

When references disagree, use this order:

1. latest explicit product-owner decision recorded in issue `#79`;
2. approved shared anatomy, except an element explicitly superseded later;
3. the owning product flow (`30.50` for Library, `30.80` for Training);
4. light-theme boards only for color/token mapping, never for semantics.

`10.30` is `[WORKING]`; it must not reintroduce older chrome merely because it
is the nearest light reference.

## Matrix

| Visible Pen address | Status                                      | Owns                              | Implementation invariant                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `10.15.04–05`       | APPROVED baseline                           | single-sense Full/Narrow anatomy  | one sense has no ordinal; later decision removes the `Betekenis` row                                                                                                                                                             |
| `10.16.01–02`       | APPROVED baseline                           | multi-sense Full/Narrow anatomy   | every meaning owns its disclosure, exposure and learning state; one headword-level translation control toggles all meaning translations while data remains meaning-bound; later decision removes aggregate `Betekenissen` chrome |
| `20.70`             | HISTORICAL REFERENCE · PARTIALLY SUPERSEDED | Full multi-sense geometry         | retain the border-cutout ordinal, exposure and disclosure geometry; do not copy its old Meaning(s), grading or footer chrome                                                                                                     |
| `20.71`             | HISTORICAL REFERENCE · PARTIALLY SUPERSEDED | Narrow and long-headword geometry | retain pronunciation-boundary wrapping; Full and Narrow use the same viewport-responsive headword scale, not independent container-width scales; do not copy its old Meaning(s), grading or footer chrome                          |
| `30.50.02`          | REVIEW                                      | Library two-pane word detail      | no grading controls; Library actions remain meaning-scoped                                                                                                                                                                       |
| `30.50.05`          | REVIEW                                      | collection membership             | Collections is a primary Library action and opens a meaning-scoped picker                                                                                                                                                        |
| `30.80`             | REVIEW/WORKING                              | Training Face → Answer            | one exact meaning per training card; Face and Answer share one stable outer shell and fixed action dock; current owner decisions below supersede stale prompt/footer chrome                                                       |
| `10.30.01–03`       | WORKING                                     | light tokens only                 | map the accepted structure to light colors; do not copy stale labels or action placement                                                                                                                                         |

## Shared component rules

- `SenseCardHeadwordLockup`: metadata above; article and headword share one
  baseline; audio is optically centered beside the headword; Full and Narrow
  share one viewport-responsive type scale.
- `SenseSectionHeader`: one quiet divider; list marker for examples, braces for
  usage, quotation mark for idioms.
- Expanded content uses the stable section order: usage pattern, examples,
  idioms, then notes. Source order is preserved within each section.
- Content accents are semantic and stable: usage pattern uses the quiet gray
  rule, examples use indigo, and idioms use amber.
- Training: no `Betekenis` header; translated definition/example text is muted;
  only the short entry translation uses the warm accent.
- Training Face: direct word-to-definition cards do not show an explanatory
  “what is this word?” label. Audio remains beside the headword when the
  platform advertises audio; the headword-level translation action is available
  when fresh translation content exists.
- Training keyboard: unmodified Space owns Face/Answer reveal even when a card
  button has focus; text-entry controls retain native typing. Enter remains the
  activation key for the focused button.
- Training responsive geometry: coarse/no-hover narrow devices may fill the
  available card height. Fine-pointer/hover desktop windows retain the 500 px
  card cap even when the window is narrower than the normal desktop breakpoint.
- Training theme: the stage uses light colors by default and the same shared
  structure switches through `dark:` tokens; dark-only card chrome is not a
  separate implementation.
- Training session footer: show only the compact centered New/Review/Total
  progress cluster. Session description and Adjust are omitted because the
  session close action already returns to Today/Setup.
- Library group controls: one translation toggle sits in the headword header and
  shows or hides translations for all meanings. Translation requests and
  rendered content remain bound to each exact entry/content node.
- Library per-sense controls: exposure and collapse at top-right. Clicking a
  collapsed card expands it; quiet down/up chevrons also expose the same action.
- In constrained Library layouts the headword header remains fixed while the
  meaning-card region scrolls. Exposure badges stay visually secondary and use
  the compact `2K`-scale geometry.
- Meaning disclosure and translation visibility animate over 300 ms without
  reserving hidden height; `prefers-reduced-motion` disables the transition.
- Library actions: Collections + Train next on the primary row; flag + `Melden`
  and Known/Undo on the quiet service row.

### Library meaning-card geometry

Full and Narrow render the same `MeaningCard`; viewport width may wrap content
but must not select a second set of typography or spacing values.

- The lead row is a two-column grid: flexible definition/translation content,
  then compact exposure + disclosure controls. It must not use floats or a
  clearing spacer.
- Collapsed block padding is 10 px; a one-line meaning is approximately 50 px
  high and grows naturally when its definition wraps. Top and bottom whitespace
  remain visually equal.
- Expanded padding is 16 px above and 12 px below.
- The gap from an untranslated lead definition to expanded details is 12 px;
  when a lead translation is visible, it is 16 px.
- Lead text is 14.5 px at 1.45 line height; top controls are 28 px high with a
  12 px column gap. Exposure badges remain 24 px high.
- These values live in the shared Library component and are covered by its
  component test. Do not reproduce them in Full/Narrow fixtures or page shells.

Any later change must update this matrix or explicitly supersede the relevant
Pen revision before implementation.
