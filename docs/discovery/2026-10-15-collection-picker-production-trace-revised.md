# Library collection picker production trace (revised)

Date: 2026-10-15 (UTC)
Surface: `https://2000.dilum.io/`, authenticated Library flow
Account: isolated issue-scoped QA user; no collection was created and no membership was changed.

## Controlled observation

The production QA wrapper verified the expected QA identity/marker and authenticated app shell. The in-page observer was installed before navigating to Library. It captured fetch/XHR starts and completions (path only, method, status, duration, initiator), performance resource entries, page-wide DOM mutation batches, dialog/control state, computed visibility/opacity/size, transitions, and a 50 ms UI sample. Capture excluded headers, tokens, bodies, user IDs, and dictionary/card text. Persisted evidence is the sparse sanitized event set in [`2026-10-15-collection-picker-production-trace-revised.jsonl`](./2026-10-15-collection-picker-production-trace-revised.jsonl).

- At +13,224.1 ms, `library-open` was marked. The Library shell mounted; available-source/list RPCs returned 200 (about 199–294 ms). The initially disabled filter control became enabled after the corresponding DOM update.
- At +23,095.3 ms, a generic search was submitted. Search/lookup and membership requests were observed; successful HTTP responses were 200. One superseded fetch rejected without an HTTP status, but the capture does not establish its cause.
- At +38,458.1 ms, the fresh accessibility snapshot confirmed the visible button `Collections · 1`; the semantic click command returned successfully.
- The page-wide observer recorded no request start/end/error, DOM mutation, or transition after that mark. The live session reported 120 UI samples over approximately six seconds; across those samples, the dialog list stayed empty and the collection controls stayed visible at opacity 1. The checked-in JSONL retains only a sparse subset of the samples, so the full count cannot be independently audited from the committed artifact. No React commit profile was available: the React render start/stop command yielded no component-level records.
- At a later non-mutating retry, the semantic locator reported the button could no longer be found and the next snapshot produced no UI output. The wrapper/browser command stalled during exit. A screenshot and coordinate hit-test could not be obtained because the wrapper rejected the needed `eval` command. This later state is ambiguous and is not evidence that the control was covered or disabled.

## Conclusion and limits

The controlled click did not produce the expected dialog in the recorded interval, which is a reproducible symptom in this one production session. The trace cannot distinguish an application handler failure from an automation/browser surface problem: no screenshot, hit-test, React commit, or post-click request was available. The retry then lost its browser response. Therefore the underlying code defect is not established, and no runtime code change is justified from this evidence alone. The collection was not mutated.

The QA wrapper's automatic revoke attempt timed out during exit. The same official revocation helper was run for this exact QA session and returned success; its protected artifacts were then removed. Only the named session was closed. No other production session was touched.

Focused picker/session component tests had previously passed in this worktree: 44 tests across `LibraryCollectionsPicker.test.tsx` and `LibrarySenseCardV2Session.test.tsx`. No source code changed in this trace update.
