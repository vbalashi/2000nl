# Issue #238 scheduler cold-I/O evidence

Production deploy run `32679943007` stopped safely before the application
switch when the exact read-only `test@2000nl.test` session-plan probe exceeded
its two-second statement timeout. Migrations 123–126 were no-ops and the prior
application remained healthy, so this recurrence disproved the earlier
post-DDL-only cache-warm explanation.

Read-only production diagnostics (`BEGIN READ ONLY`, exact QA identity,
rollback) characterized PostgreSQL 17.6 with 18,184 `word_entries`, 4,031 NT2
entries, a 71,475,200-byte entry heap, and no `is_nt2_2000` index. A warm
`EXPLAIN (ANALYZE, BUFFERS)` of the session-plan RPC completed in 183.443 ms but
touched 18,853 shared blocks (about 147 MB of buffer traffic). JIT was off;
connection setup and one-time plan compilation therefore did not own the
repeatable cold timeout.

A disposable PostgreSQL fixture reproduces the cardinality, 1.5 KB-or-larger
wide rows, NT2 proportion, exact QA identity, mixed scheduler states, daily-new
history, and single/multi-mode requests. The deterministic red/green sequence
was:

| Variant | Shared blocks | Result |
| --- | ---: | --- |
| migration 126 baseline | 15,409 | fail |
| partial covering NT2 index only | 15,425 | fail |
| index + first count-only helper | 9,977–10,018 | fail |
| index + count-only helper + materialized learner sets/settings | 1,976–1,980 | pass only with all-visible heap pages |
| same helper after distributed NT2 heap visibility was dirtied | 10,066 | fail |
| narrow synchronized scope projection + count-only helper after both heaps were dirtied | 1,825 | pass |

The index-only experiment showed that a narrow scope was necessary but not
sufficient. The first helper exposed an inlined `user_settings` lookup once per
candidate; making limits and learner sets explicit one-time relations removed
that amplification. Independent review then invalidated the ideal visibility
assumption: distributed NT2 updates pushed the index/heap path back above the
budget. The final migration therefore maintains a narrow private projection of
default-trainable identities with a source-table trigger. Even after dirtying
both the wide source heap and the projection, the representative RPC used 1,825
blocks and 16.647 ms. Its counts match the migration-126 selector for `both`,
`new`, `review`, and multi-mode cases. List and filtered requests continue
through the authoritative selector fallback.

No production learner state was changed during diagnosis, and this evidence
does not authorize a production merge or deployment.
