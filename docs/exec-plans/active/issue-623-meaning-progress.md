# Issue 623: meaning progress and Known sibling enrollment

Status: implementation in progress; not deployed.
Owner-approved intent: ../../intent/meaning-learning-progress.md
Issue: https://github.com/vbalashi/2000nl/issues/623
Branch: codex/623-meaning-progress

Owning layers: DB authoritative enrollment/familiarity/exclusion/reset/queue eligibility; existing Platform read/action projection; UI shared progress and sheet controller. Prototype is evidence, not production code.

## Delivery checklist
- [x] Freeze owner intent and source-component inventory.
- [x] Reproduce Known sibling enrollment regression and preserve prior scheduler state.
- [x] Durable meaning familiarity and rating capabilities, including undo-all Known.
- [x] Exact meaning exclusion and legacy initiating-entry migration; atomic resume clears both directions.
- [x] Server current-progress read model and localized status/progress/actions.
- [x] History exact-entry navigation and shared mobile sheet gestures.
- [x] SQL/UI regression checks, typecheck/lint, component/design inventory and actual browser QA.
- [ ] Manifest checksum/postflight, CI/review, release/deploy and exact contract health.

## Source inventory
LibrarySenseCardGroup / LibraryMeaningActions / LibraryLearningSummary, SenseCardChrome, WordDetailDrawer / useLibrarySheetResize, TrainingHistoryDestination / RecentActivityList, AppFrame, practiceTheme, articleActions; use existing control families. Design-guide contains historical V2 values; current control-system and semantic theme govern approved Library surfaces. No global styling overrides from the prototype.
