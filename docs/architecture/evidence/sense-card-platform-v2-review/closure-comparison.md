# Closure Review Comparison

Both independent reviewers agreed that revision 2 closed all accepted
round-one P0/P1 findings. Neither reported a P0 or challenged the architecture
direction.

Their remaining P1 findings were complementary:

| Finding | Source | Disposition in revision 3 |
| --- | --- | --- |
| existing private-entry group backfill | review A | accepted; one-to-one pre-exposure backfill and evidence |
| payload-bound action and draft-save retries | review A | accepted; same-payload replay, different-payload conflict |
| active-Known rollback through V1 | review A | accepted; shared selection exclusion and fail-closed legacy mutation |
| source-aware action provenance | review B | accepted; frozen `source-context-v2` and atomic action/provenance write |

No product tradeoff was introduced. These changes complete existing safety
invariants for identity, retries, provenance, and rollback. Revision 3 receives
one final focused pass restricted to these four corrections and regressions
they could introduce.
