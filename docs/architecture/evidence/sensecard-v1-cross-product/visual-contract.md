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
| `30.80`             | REVIEW/WORKING                              | Training Face → Answer            | one exact meaning per training card; Face and Answer share one stable outer shell and fixed action dock                                                                                                                          |
| `10.30.01–03`       | WORKING                                     | light tokens only                 | map the accepted structure to light colors; do not copy stale labels or action placement                                                                                                                                         |

## Shared component rules

- `SenseCardHeadwordLockup`: metadata above; article and headword share one
  baseline; audio is optically centered beside the headword; Full and Narrow
  share one viewport-responsive type scale.
- `SenseSectionHeader`: one quiet divider; list marker for examples, braces for
  usage, quotation mark for idioms.
- Expanded content uses the stable section order: usage pattern, examples,
  idioms, then notes. Source order is preserved within each section.
- Training: no `Betekenis` header; translated definition/example text is muted;
  only the short entry translation uses the warm accent.
- Library group controls: one translation toggle sits in the headword header and
  shows or hides translations for all meanings. Translation requests and
  rendered content remain bound to each exact entry/content node.
- Library per-sense controls: exposure and collapse at top-right. Clicking a
  collapsed card expands it; the explicit arrow only collapses.
- Library actions: Collections + Train next on the primary row; flag + `Melden`
  and Known/Undo on the quiet service row.

Any later change must update this matrix or explicitly supersede the relevant
Pen revision before implementation.
