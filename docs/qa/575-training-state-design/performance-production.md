# Production read-only availability count measurement

Captured 2026-10-03 on NUC against deployed **0.18.1141**, commit `60761e9b041d2d0205c2bc91c7beec7f64e80ea0`, DB contract207. Owner explicitly authorized production read-only measurements.

## Safety and reproducibility

Run `ssh nuc python3 - < docs/qa/575-training-state-design/performance-production.py` from the checkout. The script obtains `DATABASE_URL` from the existing UI container server-side, passes credentials only through process environment to the existing digest-pinned PostgreSQL17 client container, and never prints secrets, owner identifiers, SQL plans or learning content. No host packages are installed. Every connection runs `BEGIN READ ONLY`, `statement_timeout=3s`, `lock_timeout=250ms`; all transactions end with `ROLLBACK`. No temporary fixture or data mutation in production.

Owner scope: existing learner with most status records, selected entirely inside SQL; not a hard-coded or exposed user ID. It has **1648 status records**. Database has **18224 entry/meaning records**, including4031 core records. No heavy full candidate planner was called.

## SQL-only results

15 measured warm repetitions plus first invocation per case, one persistent connection within each case. `EXPLAIN (ANALYZE, FORMAT JSON, TIMING OFF)` reports database execution and planning times. Plans are parsed server-side and discarded; only sanitized numbers return. These times exclude network roundtrip, Next auth/API, browser and rendering. First invocation is not a controlled cold-cache measurement. p95 for15 observations is the largest observation; this is a small diagnostic sample, not a production latency SLO.

| Probe | Actual entries selected | First execution ms | Median execution ms | p95 execution ms | Median planning ms |
|---|---:|---:|---:|---:|---:|
| stats-core-direct | 4031 core | 758.113 | 418.220 | 432.317 | 0.027 |
| stats-core-both | 4031 core | 510.180 | 503.677 | 564.303 | 0.026 |
| prototype-all-limit50 | 50 | 0.922 | 0.906 | 0.921 | 0.334 |
| prototype-nouns-limit50 | 50 | 0.980 | 0.969 | 0.995 | 0.336 |
| prototype-verbs-limit50 | 50 | 1.134 | 1.097 | 1.141 | 0.350 |
| prototype-all-limit500 | 500 | 2.605 | 2.511 | 2.570 | 0.336 |
| prototype-nouns-limit500 | 500 | 3.598 | 3.523 | 3.562 | 0.356 |
| prototype-verbs-limit500 | 500 | 4.687 | 4.492 | 4.583 | 0.336 |
| prototype-all-limit4031 | 4031 | 11.802 | 11.764 | 11.872 | 0.326 |
| prototype-nouns-limit4031 | 4031 | 19.530 | 19.035 | 19.191 | 0.343 |
| prototype-verbs-limit4031 | 4031 | 22.122 | 21.831 | 21.957 | 0.342 |
| prototype-all-limit18163 | 18163 | 49.204 | 48.931 | 51.707 | 0.359 |
| prototype-nouns-limit18163 | 9547 | 38.854 | 38.731 | 40.241 | 0.378 |
| prototype-verbs-limit18163 | 4311 | 23.528 | 23.140 | 24.023 | 0.355 |

## Interpretation and limitations

Existing detailed stats costs **418ms median /432ms p95** fordirect and **504ms /564ms** forboth directions. It provides broad daily counters and does not accept complete recipe filters. Reusing it for all saved recipes would create unnecessary load and still would not produce the correct three indicators.

A narrow combined aggregate prototype over18163 real entries and this learner's1648 states costs **48.9ms median /51.7ms p95** SQL execution, plus0.36ms planning. POS scopes are measured separately; noun/verb material may be smaller than requested cap. There are61 database entries beyond the full prototype cap; do not describe this as a complete18224-entry query.

The prototype counts direction-specific answered FSRS-enabled states, all such reviews, and unanswered cards. Due today uses endofEurope/Amsterdam day. It omits authoritative source/access/known/frozen/hidden exclusions, first-meaning ordering and reverse unlocks, idiom target identity, and contextual Translation example eligibility. It is **not** a deployable availability endpoint or proof of final matching counts. These measured scans show a much cheaper shape than broad existing stats or the full planner; final projection must share authoritative eligibility and be measured again.

No API/network measurements, no100-recipe fanout, no production concurrent load experiment, no cache implementation measured. Recommendation remains one selected-recipe request, normalized recipe/day/learning-revision cache identity, invalidation after accepted learning actions and access changes, no rapid polling. Session start remains authoritative.
