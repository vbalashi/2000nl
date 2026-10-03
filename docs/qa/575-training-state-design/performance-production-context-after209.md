# Actual production context count after209

Exact deployed commit `73e8f4651dea4436281322511f20f75fd1372c87`, compatible DB209. Same curated Dutch context-reverse recipe and internally selected existing answered-history learner as previous208probe. History facts unchanged:435answered ordinary states,114answered reverse states. Final counter read timestamp2026-10-03T20:54:47.049808Z; learner studyDay2026-10-03 / Europe/Amsterdam.

Actual authoritative RPC EXPLAIN ANALYZE TIMINGOFF SQL execution on one connection:

| Observation | SQL execution |
| --- | ---: |
|First invocation |6000.616ms |
|Warm median (5samples) |286.490ms |
|Warm minimum |281.839ms |
|Warm maximum |299.652ms |

Raw sequence6000.616,299.652,291.425,286.490,281.839,283.639ms retained in JSON. No p95 claim with5warm samples. First invocation is not a controlled cold-cache experiment; planning/cache/history of the database were uncontrolled. **The first call still costs6seconds**. Warm calls are below300ms in this run; do not claim all first loads are instantaneous.

Counters match the earlier208exact-recipe result:71dueToday /94totalReviews /1newCard. The20810.77s/7.97s observations were process wall times including startup/network, so cannot quantify a rigorous SQL before/after multiplier. The retained209observations are isolated SQL execution times; API authentication/network/rendering are excluded. Parent independently checks authenticated browser HTTP behavior.

Safety: fresh verified health JSON, exact expected commit, independent deployed-containercommit and actual/expected DB209 guards. Every transaction READ ONLY,15s statement_timeout,250ms lock_timeout,rollback. No user IDs/material IDs/credentials/source text emitted. No production writes. Reproduction script accepts validated runtime --list-id; do not embed learner identifiers in evidence.

Artifacts: `performance-production-context-after209.py` and `performance-production-context-after209-results.json`. No further production probes performed by this agent.

## Owner browser verification

After exact209deployment, the owner's existing in-app browser tab was reloaded while still on the Training overview (no active session). Authenticated availability requests both returned200 in1360ms and817ms, measured via browser Resource Timing. The visible Translation counters were71/94/1 with no error. Prior client577verification also loaded Words188/374/1837 and Idioms4/4/318; Translation selection was restored. No session or review was started. HTTP durations include authentication/network and must not be compared directly with isolated SQL timings. Native browser screenshot capture was unavailable; visible DOM and network responses provided the verification signal.
