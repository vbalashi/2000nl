# Owner visual corrections — round 2

Goal: address every new browser comment and add Billing & subscriptions information. Keep original numbers. Execute sequentially; investigate uncertainties last. Previous round remains recorded in 407-owner-final-audit.md.

## Dependency order and acceptance criteria

- [x] 1 — Remove text-size explanation, device-profile explanation and ordinary Saved label; retain errors/retry.
- [x] 2 — Remove translation-language helper.
- [x] 5 — Remove new-training/session continuation helper.
- [x] 6 — Remove Published dictionaries heading.
- [x] 25 — Remove measured-since statistics note without changing time data.
- [x] 26 — Review queue shows only localized due-card count and existing action.
- [ ] 15 — Hint example rule uses theme palette.
- [ ] 11 — Direction cards more compact vertically; retain bounded width and wrapping.
- [ ] 3 — Translation controls do not wrap unnecessarily at Normal size.
- [ ] 4 — Learning-language surface matches Settings; Plus + Add language quiet action.
- [ ] 8 — Interface-language menu rounded, accessible, consistent with app.
- [ ] 27 — Add truthful read-only Billing & subscriptions section; do not invent payment status/invoices.
- [ ] 9 — Compare prototype navigation icons and shared tablet/mobile/desktop thresholds.
- [ ] 10 — Compact rounded desktop navigation and smoother selection.
- [ ] 17 — Search persists only within current page lifetime, clears on reload.
- [ ] 18 — Collection filtering belongs inside filter, remove duplicate toolbar toggle.
- [ ] 20 — Metadata language + source, omit Search label.
- [ ] 19 — Below search: language/source left, match count right, no duplicate summary.
- [ ] 21 — Remove duplicate bottom page/result prose, preserve whole-list scrolling.
- [ ] 24 — 50 words/page; floating centered arrows, current/total red label; final item scrolls above controls.
- [ ] 22 — Library desktop list/article panes, no training right drawer.
- [ ] 23 — Mobile Library bottom sheet starts half-height; handle expands/collapses, X closes.
- [ ] 13 — Close inline with audio/translation; larger gap before close.
- [ ] 14 — Compare Normal headword size and article gap with prototype.
- [ ] 12 — Expose canonical exclusion action alongside Known in article.
- [ ] 16 — Investigate action history/Undo; document separate case if additional contract work required.
- [ ] 7 — Resolve consistent capitalization of standalone language labels; grammar/content untouched.

## Additional clarification retained

The owner rejected generic “Translation example → Words” wording. Use a concrete source example and its exact translated counterpart in direction previews. :codex-annotation{index="1"}

## Verification

Use narrow checks per checkpoint, then relevant typecheck/component tests and local browser review against prototype. No push, merge or deployment. Open questions are deferred until independent work is complete.
