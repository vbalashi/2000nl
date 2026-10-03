# Actual production availability RPC208 benchmark

Captured 2026-10-03T19:51:19.054639+00:00. Application 0.18.1142, exact commit `9ecfeec404cf767b4c1cbb51124cc4d274a5186c`, verified compatible DB contract208, PostgreSQL17.6. This measures the deployed authoritative `read_training_recipe_availability_v1`, not the earlier simplified prototype or existing detailed-stats RPC.

## Result

The real production projection is **not yet reliably fast under this benchmark bound**. The3-second bound belongs to this read-only benchmark, not necessarily the application API or RPC runtime configuration. A benchmark timeout does not establish that normal production requests fail: they may complete after3seconds; that completion time was intentionally not measured. Four scopes exceeded the3-second per-statement safety bound. Successful scopes cost approximately1.1–1.4seconds SQL execution. Local empty-history measurements of266–495ms do not establish production latency with real learner history.

| Scope | Successful warm samples | Median SQL execution | p95 SQL execution | Due today / total reviews / new |
| --- | ---: | ---: | ---: | --- |
| meaning-all-direct | 0 | ≥3000 ms (timeout) | — | Not obtained |
| meaning-all-both | 0 | ≥3000 ms (timeout) | — | Not obtained |
| meaning-nouns-both | 10 | 1444.15 ms | 1788.99 ms | 90 / 179 / 7300 |
| meaning-verbs-both | 10 | 1102.28 ms | 1184.32 ms | 73 / 117 / 2852 |
| context-reverse | 0 | ≥3000 ms (timeout) | — | Not obtained |
| idiom-direct | 0 | ≥3000 ms (timeout) | — | Not obtained |
| idiom-both | 10 | 1438.93 ms | 1446.66 ms | 3 / 3 / 651 |

p95 uses nearest-rank with10samples, so it is the maximum warm observation; it is a small-sample descriptive value. A failed case reports zero retained successful samples because the bounded psql transaction stops at the first timeout; no median is inferred. The3seconds is a censoring bound, not a measured completion time.

Real source volume:18,224entries,18,203active bindings,40,746active content nodes. Internally selected existing learner has1,648ordinary state rows,435answered ordinary states,114answered reverse states; the selected idiom principal has3answered idiom states. No user identifiers or learning content were emitted. Idiom-both confirms nonempty real idiom history; context has real reverse history but timed out before its counters could be obtained.

## Method and safety

NUC server runs the existing digest-pinned PostgreSQL client against the deployed database. Every transaction explicitly uses READ ONLY,3s statement_timeout,250ms lock_timeout and rollback. No learner records, schema, temporary fixture, session planner or scheduling actions were changed. Each scope attempts first execution plus10warm EXPLAIN ANALYZE TIMINGOFF calls on one connection, then a separate counter read. All dictionary language scope is Dutch, dateWindowall; POS noun/verb cases use canonical zn/ww identifiers. First execution is not a controlled cold-cache measurement.

The public health request from NUC was blocked by HTTP access policy. Root separately fetched and verified public health, transferred sanitized JSON to NUC, then this script required its freshness (≤10minutes), exact expected commit, compatible208health and an independent exact deployed-container NEXT_PUBLIC_APP_COMMIT match before opening DB queries. Initial blocked attempt stopped before DB access. Full plans remain in server-process memory and are not emitted.

SQL execution times exclude HTTP, authentication, API routing, network transport and rendering. These results do not predict end-to-end UI latency. Concurrent production load was not controlled. Do not present timeout scopes as empty or zero availability. Existing API error handling should retain an explicit unavailable state rather than fabricate zero.

## Reproduction

After independently verifying the deployed exact commit and copying fresh sanitized health to NUC:

```sh
ssh nuc python3 - --expected-commit 9ecfeec404cf767b4c1cbb51124cc4d274a5186c --verified-health-file /tmp/575-production-health-208.json < docs/qa/575-training-state-design/performance-production-availability208.py > docs/qa/575-training-state-design/performance-production-availability208-results.json
```

Artifacts: `performance-production-availability208.py` and `performance-production-availability208-results.json` contain the secured workflow and sanitized observations. Next investigation should compare production physical plans/history-dependent branches in an isolated representative fixture; do not loosen eligibility guards or repeatedly execute expensive production queries. Cache only the selected recipe and invalidate after accepted learning changes; cache improves repeat selection but does not solve cold-count cost.
