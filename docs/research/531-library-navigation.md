# Library navigation retention — 2026-10-02

Issue: https://github.com/vbalashi/2000nl/issues/531

## Findings and decisions

LibraryDestination already stays mounted across destination changes. Two effects nevertheless made return expensive: search ran again on `open`, and the material catalogue cleared its language inventory while closed, forcing a source reload/readiness reset. A component regression reproduced two list reads after an immediate close/open; the change retains one.

Keep the catalogue scoped to authenticated account and language while mounted. Retain the current search projection for 30 seconds, with freshness/inflight keys including owner, language, target language, source, query, filters, page, collection scope and material revision. Collection identity is only relevant when its filter is applied. Retry and collection changes bypass freshness. Changed scopes still fetch independently; there is no persistent or shared cross-account cache.

Approved Library warms after 750 ms, outside the foreground initial render. It uses the same search path rather than a second prefetch cache. A fresh return makes no list request; an older return refreshes without replacing existing results with a loading screen. This does not promise instantaneous cold entry before the background request finishes.

Navigation uses one measured selection element per navigation surface, transitioning position and size for 240 ms. ResizeObserver covers responsive layout and label widths. Reduced-motion preferences disable visible movement, including the app's existing global near-zero transition override.

## Verification

- Red regression: expected one list read, received two before the fix.
- 108 component tests passed: TrainingScreen 70, navigation 9, Library grouping 29, including retention, preload reuse and freshness expiry. Existing cases cover queries, pagination, source scope, catalogue refresh and retry.
- Typecheck passed. Lint has only the pre-existing TrainingSenseCardV2Session audio-effect warning.
- Real local DB (contract 195), approved presentation, headless Chromium desktop 1000×900: warmed Library row visible 175 ms after starting the click; three close/reopen cycles made zero additional list requests.
- Initial two HTTP reads had different cursors: the second fills the page; it is not an identical repeated search.
- Mobile 472×954 additionally checks intermediate indicator movement and reduced motion.

The timing is local browser evidence, not a production latency claim. No SQL/RPC change, personal production interaction, or network emulation was used.

## Broader verification correction

First CI run passed 1665 tests and failed two TrainingScreen cases. Forced refresh after a collection mutation also ran an empty, non-browse lookup, clearing the newly created detail. Restrict forced reads to an actual query, collection filter or approved browse. The selected-next-card failure was a consequence of the preceding failed test leaving its one-shot fixture pending; it passed alone. All 108 relevant tests pass together after the correction, without changing either existing integration test.
