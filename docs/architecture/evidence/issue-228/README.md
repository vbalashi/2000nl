# Issue #228 scheduler timeout evidence

The local comparison uses 18,184 source-managed Dutch entries in a 54 MB
disposable PostgreSQL relation, matching the production entry count observed
during diagnosis. It compares the retired raw JSON predicate, migration 125's
indexed anti-join, and the complete `get_next_card` scheduler.

The indexed exclusion was roughly 9–12× faster than the raw predicate in this
cache-warm local fixture. More importantly, the complete scheduler stayed inside
the explicit rollout budget: first call ≤2,000 ms, warm p95 ≤1,000 ms, warm max
≤2,000 ms. This local receipt is not represented as disk-cold evidence; the
post-integration rollout must still repeat bounded cold/warm production reads.
