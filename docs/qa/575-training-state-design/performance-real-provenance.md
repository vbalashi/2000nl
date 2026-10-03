# Real source-provenance availability performance investigation

2026-10-03. Canonical local Supabase PostgreSQL17.6, imported real dictionary: **18163 entries /18163 active source bindings /40403 active source content nodes**. Local QA principal has no answered FSRS history, selected entirely within SQL; user ID excluded from evidence. All measurements READ ONLY, bounded statement timeout, no learning-state mutation. First sample is first invocation during this diagnostic, **not controlled cold-buffer measurement**.

## Failure and cause

Actual availability RPC before optimization: first **5982ms**, five warm samples median **5946ms**. Output0dueToday /0totalReviews /13867newCards.

Turning JIT off alone: **5936ms**; LLVM compilation did not explain the delay. Session-local hash strategy (`enable_nestloop=off`, `jit=off`) returned the identical counters in **288ms**. These single diagnostic probes are not p95 measurements.

Expanded exact count-prefix EXPLAIN ANALYZE with TIMING OFF exposed the cause: `ordinary_source_introductions` was estimated at1row. PostgreSQL selected a nested-loop LEFTjoin, materialized **16356 actual introduction rows**, and scanned that materialization **17445 times**, rejecting **285314064 join comparisons**. Instrumented baseline execution8748ms; equivalent hash strategy221ms. EXPLAIN overhead and expanded query plan differ from the actual RPC, so those durations should not be substituted for RPC latency.

`auto_explain` loading is prohibited by the local Supabase library allowlist. That limitation was respected; no bypass or global DB configuration change was attempted. The final evidence instead uses EXPLAIN of the exact SQL prefix, with UUIDs redacted.

## Verified implementation

The DB worker configured join planning only inside the new availability-count helper. Every eligibility predicate stays unchanged; the authoritative scheduler is not modified. The helper's JIT setting avoids compilation triggered by planning penalties for unavoidable singleton nested joins. Session settings before and after the RPC both remain `enable_nestloop=on`, `jit=on`.

Measured through a persistent local node-postgres connection, first invocation plus5warm samples each. These durations include loopback/driver overhead, not HTTP/auth/UI. The real fixture covers source bindings and first-sense ordering that the earlier dense legacy fixture did not; that earlier benchmark alone was insufficient.

| Recipe | First ms | Warm median ms | Warm min–max ms | New cards |
|---|---:|---:|---:|---:|
| direct | 297.97 | 265.50 | 262.31–269.65 | 13867 |
| both | 370.96 | 371.88 | 371.30–385.50 | 13867 |
| nouns | 488.56 | 494.99 | 492.71–501.46 | 7532 |
| verbs | 391.76 | 382.81 | 378.66–400.59 | 2975 |
| context | 309.81 | 319.03 | 304.23–322.54 | 0 |
| idiom-both | 244.05 | 239.21 | 238.21–244.41 | 0 |

Direct counters exactly match the pre-optimization0/0/13867 baseline. Both has the same13867introducible new cards because reverse introductions are gated; no FSRS formula or grading mutation changes. POS-filter counts have unchanged query predicates; SQL worker's contract tests verify parity/guards. Context and idiom timings represent this **empty-history QA principal**, returning no eligible material; they are not a populated-idiom or answered-context load test.

Production RPC208 latency remains unmeasured until this implementation is deployed. Earlier production measurements concern existingstats/simplifiedprojection and must not be relabelled as the final RPC. This fixes the demonstrated local6second regression; finalproduction measurement must verify actual source material and learner history again.

## Evidence

* `performance-real-provenance.cjs`: baseline actual RPC and expanded static plan.
* `performance-real-provenance-plan.cjs`: read-only expanded analyzed baseline/hash plan.
* `performance-real-provenance-analyze.json`: sanitized full plans and buffer/loop evidence.
* `performance-real-provenance-jitoff.json`, `performance-real-provenance-hash.json`: one-probe diagnostics.
* `performance-real-provenance-optimized.cjs` and results: implementedhelper measurements and setting restoration.


Root authenticated HTTP verification against the same canonical local DB208: all-dictionaries Direct returned identical0due/0reviews/13867new with200 responses. Before optimization:6236/6314/6413ms; after:696ms first (development rebuild),300/286ms warm. This includes local authentication/HTTP/RPC overhead, not a production browser measurement.
