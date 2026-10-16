# Library collection refresh and focus — issue #702

Issue: [#702](https://github.com/vbalashi/2000nl/issues/702)

## Baseline evidence

The sanitized production trace collected during the new-user QA cycle on
2026-10-16 showed successful collection writes (`204`) alongside repeated
membership-control disabled intervals. The native collection dialog stayed
open. Focus moved outside the dialog during refresh and was not restored. The
create flow was accompanied by 14 requests spanning Training, search, and
lookup; the captured observer did not provide reliable React commit attribution.
The checked-in trace retained only a sparse subset of the observed samples, so
the complete sample count and timing distribution are not independently
auditable from repository artifacts.

This is baseline evidence from the deployed version. The fix in this branch was
not deployed, so no production claim is made about its effect.

## Diagnosis

Two independent UI behaviors explained the local regressions:

1. `DictionarySearchTab` invalidated and reran grouped dictionary search after a
   collection membership change whenever a query or material settings were
   active. Those searches do not depend on membership unless the current search
   is filtered by a viewed collection. Search projection churn could therefore
   refresh the detail card and its membership read unnecessarily.
2. The picker disabled the focused checkbox while a membership read was pending.
   Native browser focus then left the checkbox, and the picker had no focus
   handoff or restoration behavior.

The refresh predicate is now tied to the actual collection filter
(`applyListFilter && viewedListId`). Collection summaries still reload and
notify their owner after every save. When a focused checkbox is toggled, focus
moves into the collection region while membership is pending and returns to the
checkbox after a successful read only if the user has not moved focus elsewhere.

## Verification

- The query-only membership test failed before the fix because grouped search
  ran a second time; it passes with no extra search after the fix.
- The active viewed-collection positive control continues to refetch its
  membership results and removes the now absent entry.
- The component focus test covers two consecutive refresh cycles and confirms
  focus remains on Done when the user moves there before the read completes.
- A local Chromium Playwright test mounts the actual training detail and
  `LibraryCollectionsPicker`, holds the membership RPC pending, and verifies
  focus handoff and restoration through the real browser DOM.
- `npm test -- tests/DictionarySearchTab.grouping.test.tsx
  tests/LibraryCollectionsPicker.test.tsx` — 38 tests passed.
- `npm run typecheck` — passed.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm exec playwright -- test
  playwright/tests/library-collection-focus-702.spec.ts --reporter=line` —
  passed against local fixtures. Port 3100 was occupied by another issue's
  local server; the temporary 3101 server was stopped after the run.

No production QA session was opened for this patch: the production bundle does
not include it, and the existing baseline trace already captures the original
behavior. The local browser test exercises the actual picker implementation
without modifying production data.
