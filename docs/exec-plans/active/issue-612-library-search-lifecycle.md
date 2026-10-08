# Issue 612: Library search lifecycle

The applied Library search has one request owner: `useLibrarySearchLifecycle`.
It schedules reads, keys freshness, deduplicates pending work, fences stale
responses, handles group cursors and invalid-cursor recovery, and maps failures
to the existing UI messages. It calls the existing grouped Library client or
collection list service; transport contracts and server authorization remain
unchanged.

`DictionarySearchTabState` remains the durable-in-component owner of query,
scope, result rows, totals, cursor stack, page, and selection. This keeps
preloaded and hidden Library results available on reopen. The component keeps
selection/detail projection and detail hydration. `AccountLibraryFilters`
continues to own only draft preview requests; its preview is not the applied
search lifecycle.

Characterization coverage lives in `DictionarySearchTab.grouping.test.tsx` and
`libraryFilteredGroupSearch.test.tsx`. It covers repeat Apply refresh, pending
same-scope deduplication, stale collection/group responses, debounce and abort,
cursor paging/recovery, error/retry behavior, and reopen freshness.
