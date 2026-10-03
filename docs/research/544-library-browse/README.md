# Library browse query boundary (#544)

The owner's first Library search returned HTTP 500 after roughly 8.47 seconds.
Read-only production PostgreSQL logs identified SQLSTATE `57014` at
2026-10-02 13:56:22.644 UTC in the filtered Library lookup base: statement
timeout. This was not evidence of the browser's 12-second timeout firing.
The production checkpoint is recorded in
[issue #544](https://github.com/vbalashi/2000nl/issues/544#issuecomment-5954226843).

## Change and ownership

Migration 196 owns the empty-query browse query in the database. It resolves
live material selection and dictionary access, groups narrow search documents,
and chooses a bounded page before projecting wide entry JSON. Nonempty search
continues through its existing implementation. The service-only public wrapper,
cursor identity, exact total count, article/POS filters, all-sense projection,
and fail-closed presentation identity remain unchanged. No learner state is
written, and the new private helper has no client/service-role execute grant.

The first-party Library service classifies SQLSTATE `57014` as HTTP 503
`library_search_timeout`, allowing the separately bounded Library read retry.
Other failures retain their previous status. The route forwards existing
Server-Timing measurements without adding query or principal data.

## Evidence and limits

`local-query-evidence.json` records read-only comparisons on disposable local
database `2000nl_fsrs_544_perf`, containing a copy of the local public dictionary
and no learner history. Default browse had 14,449 groups. Complete query-body
payload/count/cursor equality was checked for default, noun/de, and verb scopes.

| Scope | Baseline median ms | Bounded median ms | Baseline buffers | Bounded buffers |
| --- | ---: | ---: | ---: | ---: |
| Default | 388.08 | 103.42 | 132,877 | 3,635 |
| Noun/de | 271.92 | 239.76 | 53,872 | 7,934 |
| Verb | 208.09 | 205.42 | 35,902 | 7,982 |

These are warm local execution measurements, not production or cold-load
latencies. Seven actual RPC executions under each forced custom/generic plan
also passed; default generic-plan buffer counts remained about 4,313.
`apps/ui/scripts/benchmark-library-browse.ts` reproduces the comparison only on
a guarded disposable local database with at least 10,000 matching groups.

On 2026-10-03, five transactional SQL tests passed: full paging/filter/cursor
parity, private unindexed owner scope and subscription access, overlapping
source groups with live/expired entitlements and paused material, generic-plan
wide-table avoidance, and missing-identity/private-helper boundaries. Fifteen
Library API/service tests, six deployment-contract tests, typecheck and focused
lint passed. Both full forward and read-only postflight-196 chains passed on
the disposable database. Migration/probe hashes match the manifest.

## Rollout and remaining acceptance

Contract 196 is additive and retains the prior application image's API shape.
Rollback restores the previous image and leaves the optimized read helper in
place. Production deployment must use the reviewed contiguous manifest and
postflight chain; this preparation did not write production or reset the shared
local database. After deployment, verify exact application SHA/contract and
repeat bounded first-page production reads, separating cold and warm results.
Owner-perceived instant availability additionally depends on the separately
retained/preloaded Library client slice (#536).
