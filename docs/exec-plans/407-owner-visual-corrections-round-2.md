# Owner visual corrections — round 2

Goal: address every new browser comment and add Billing & subscriptions information. Keep original numbers. Execute sequentially; investigate uncertainties last. Previous round remains recorded in 407-owner-final-audit.md.

## Dependency order and acceptance criteria

- [x] 1 — Remove text-size explanation, device-profile explanation and ordinary Saved label; retain errors/retry.
- [x] 2 — Remove translation-language helper.
- [x] 5 — Remove new-training/session continuation helper.
- [x] 6 — Remove Published dictionaries heading.
- [x] 25 — Remove measured-since statistics note without changing time data.
- [x] 26 — Review queue shows only localized due-card count and existing action.
- [x] 15 — Hint example rule uses theme palette.
- [x] 11 — Direction cards more compact vertically; retain bounded width and wrapping.
- [x] 3 — Translation controls do not wrap unnecessarily at Normal size.
- [x] 4 — Learning-language surface matches Settings; Plus + Add language quiet action.
- [x] 8 — Interface-language menu rounded, accessible, consistent with app.
- [x] 27 — Add truthful read-only Billing & subscriptions section; do not invent payment status/invoices.
- [x] 9 — Compare prototype navigation icons and shared tablet/mobile/desktop thresholds.
- [x] 10 — Compact rounded desktop navigation and smoother selection.
- [x] 17 — Search persists only within current page lifetime, clears on reload.
- [x] 18 — Collection filtering belongs inside filter, remove duplicate toolbar toggle.
- [x] 20 — Metadata language + source, omit Search label.
- [x] 19 — Below search: language/source left, match count right, no duplicate summary.
- [x] 21 — Remove duplicate bottom page/result prose, preserve whole-list scrolling.
- [x] 24 — 50 words/page; floating centered arrows, current/total red label; final item scrolls above controls.
- [x] 22 — Library desktop list/article panes, no training right drawer.
- [x] 23 — Mobile Library bottom sheet starts half-height; handle expands/collapses, X closes.
- [x] 13 — Close inline with audio/translation; larger gap before close.
- [x] 14 — Compare Normal headword size and article gap with prototype.
- [x] 12 — Expose canonical exclusion action alongside Known in article.
- [x] 16 — Investigate action history/Undo; document separate case if additional contract work required.
- [x] 7 — Resolve consistent capitalization of standalone language labels; grammar/content untouched.

## Additional clarification retained

The owner rejected generic “Translation example → Words” wording. Use a concrete source example and its exact translated counterpart in direction previews. :codex-annotation{index="1"}

## Verification

Use narrow checks per checkpoint, then relevant typecheck/component tests and local browser review against prototype. No push, merge or deployment. Open questions are deferred until independent work is complete.

Comment 16 researched and recorded in [separate case](407-action-history-undo-case.md). History UI/long-lived Undo is not yet implemented; owner allowed separate work. Confirm eligibility policy at final review.

## Verified checkpoint — 2026-10-01

- 25 interface comments implemented; comment 16 is the expressly permitted separate history/Undo case. Billing information (additional item 27) is visible in Settings, localized in EN/NL/RU, and does not claim a paid plan or invoice state without a payment integration.
- Collection selection now lives inside Filters and can choose any available collection, rather than a duplicate toolbar toggle. Incompatible dictionary/part filters are cleared when selecting a collection; the existing authenticated collection read path supplies results/counts.
- Library displays 50 records per UI page. The existing RPC bounds each read to 25 groups, so two cursor reads are combined with their matching-entry projections. Generic Platform lookup remains at 10 groups. No SQL migration or scheduling change.
- Browser: RU/Normal, 755px Settings; rounded language menu and Escape/focus return; no needless Off-button wrap; clean Appearance preview with concrete NL example and EN translation; billing section visible.
- Browser: search `kilo` survives destination switches but reload clears it. Empty browse contains 50 word rows, 14,449 matching groups, 289 pages; next page starts `aaneen`. Collection VanDale 2k can be selected within Filters and applied.
- Browser: at 472px Library sheet opens at prototype peek height, leaves the list visible, handle expands/collapses, X closes; audio and close share one row. At 755px desktop panes and upper navigation are used. Temporary viewport reset, account preferences unchanged.
- Browser: Statistics initially showed transient load failures during development; retry succeeded. Real due queue shows `14 карточек для повторения`, with no measured-since prose. No fabricated counts.
- Validation: typecheck passed; 169 tests across 19 relevant suites passed. Initial failures asserting removed copy/native select were updated to the requested behavior. Added coverage for selecting a non-current collection and preserving matching entries across combined pages. Legacy close behavior remains unchanged.
- Screenshots: `/Users/khrustal/adhoc/2000nl-407-visual-evidence/r2-billing.png` and `r2-library-peek.png`.
- Open product decision, deferred as requested: History Undo available while the original action remains active, or time-limited? Separate case records the proposed policy and required server/UI validation. This feature is not claimed implemented.
