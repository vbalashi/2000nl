# Library collection picker production trace

Date: 2026-10-15 (UTC)
Surface: `https://2000.dilum.io/`, authenticated Library flow
Account: dedicated issue-scoped QA account; no card or collection mutation was made.

## Actions and observations

The QA wrapper verified the production origin, an unexpired QA session, and the
authenticated Primary navigation containing Training and Library. From the
Training surface, I opened Library, entered one dictionary query, waited for
the result/detail view, and clicked the visible `Collections · 1` control. The
control was present in a fresh accessibility snapshot immediately before the
click. The command returned successfully. The next snapshot, taken 800 ms later,
still showed the same detail controls and no Collections dialog.

This is a bounded observation, not a confirmed click defect. The automation
target was an accessibility ref rather than a recorded native pointer event,
and the capture did not include a screenshot. No collection was created and no
membership was changed.

## Sanitized network timeline

Times below are milliseconds from the installed in-page trace hook. Requests
initiated by the action used `fetch`; the persisted evidence contains endpoint
paths only, with query strings, request/response bodies, headers, user IDs and
dictionary text excluded. `/tmp/qa702-run/trace.jsonl` is the sanitized raw
trace retained for this task; the lines below summarize its request events.
The durable action/request rows are in
[`2026-10-15-collection-picker-production-trace.jsonl`](./2026-10-15-collection-picker-production-trace.jsonl).

- `library-open` at 7,616.6 ms.
- Available dictionary sources: `POST /rest/v1/rpc/get_available_dictionary_sources`, 200, 227.8 ms.
- Available word lists: two `POST /rest/v1/rpc/get_available_word_lists` calls, 200, 242.5 ms and 2,109.5 ms.
- Library search: `POST /api/library/search`, 200, 6,280.1 ms.
- A subsequent search fetch rejected after 672.6 ms without an HTTP status; the trace did not capture the rejection reason. A later search returned 200 in 934.5 ms. The failed fetch may have been an aborted superseded request; that is not established.
- Lookup: `POST /api/platform/v2/lookup`, 200, 732.8 ms; collection-membership reads returned 200 in 183.5 ms and 73.5 ms.
- A later lookup returned 200 in 1,937.8 ms, followed by a membership read returning 200 in 864.9 ms.
- `collections-control-click` at 41,416.8 ms. No subsequent request start/end or fetch error was recorded before the final snapshot.

Duplicate `resource` entries in the raw capture are browser Performance API
records for the same fetches, not separate requests. Pre-hook buffered resource
entries were excluded from the timeline.

## Render evidence and limits

The trace installed a fetch wrapper, a `PerformanceObserver`, a transition
listener, and a `MutationObserver` scoped to mutations whose targets were
already inside a dialog. It did not observe parent-level insertion of a new
dialog, mutations elsewhere in the Library page, or React commits. Therefore,
the lack of recorded dialog mutations/transitions cannot establish that the
whole page did not rerender or flicker. The accessibility snapshot establishes
only that no dialog was present 800 ms after the attempted click.

The production build/release identifier was not captured. No implementation
defect was established from this trace, so no runtime code change was made.
The existing focused component tests already exercise opening the Collections
dialog and its create/toggle flows.

## Local verification

`npm test -- tests/LibrarySenseCardV2Session.test.tsx tests/LibraryCollectionsPicker.test.tsx`
passed: 44 tests across 2 files.
