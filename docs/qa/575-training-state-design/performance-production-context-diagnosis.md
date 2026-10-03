# Exact curated context availability diagnosis

Production0.18.1142 / commit9ecfeec404cf767b4c1cbb51124cc4d274a5186c / DB208,2026-10-03. User reported corrected authenticated browser request ending503 afterabout9.58seconds (root observation); original400 was a separate client request-shape defect.

One explicitly authorized read-only15-second bounded probe of the curated Dutch context-reverse recipe completed:71dueToday,94totalReviews,1newCard. It used the existing learner with most answered ordinary state; no identifiers or source text emitted. This selection likely corresponds to the reported history but owner equality to browser was not independently established. RPC wall time10,770ms includes ephemeral client startup/network; this is not isolated SQL execution timing. It demonstrates cost, not an empty queue or auth failure for this sampled learner.

Expanded installed eligibility relation, same parameters and function-scoped planner settings, EXPLAIN ANALYZE TIMINGOFF:3,023.299ms execution /117.412ms planning. Its standalone constants can produce a different physical plan from the cached SECURITY DEFINER SQL helper; do not compare them as equivalent measured RPC execution paths.

Plan shows4,001candidate scope entries; the mode/context join rejects3,508rows through training_word_context_candidate_v1 before493remain, later446eligible rows survive additional guards. Correlated filter CTE scans execute4,001times in list membership. The context helper is invoked per entry and its own nested work is opaque in this outer plan, so this evidence identifies a likely hot path, not proven exclusive bottleneck. Generic parameterized execution is also a likely contributor to the RPC-versus-expanded difference.

Recommend inspect training_word_context_candidate_v1 and its authoritative source/exclusion guards for a set-based eligibility relation, plus custom planning of the bounded count helper. Preserve every predicate and introduction/exclusion/privacy behavior. Confirm parity with real answered/context history in an isolated fixture before SQL changes. Raising the browser timeout alone would retain a multi-second wait.

Safety: all transactions READ ONLY,15s statement_timeout,250ms lock_timeout,rollback; parent explicitly authorized this increased bound for diagnosis. No schema/data/session mutations. Exact deployment guarded by fresh verified health and independent containercommit. The public3s benchmark results remain separate and unchanged. Script and sanitized JSON retained alongside this report. No further production probes performed.

## Follow-up bounded trials

All retain71dueToday /94totalReviews /1newCard for the sampled learner and exact curated context recipe. Every trial is one observation, not a statistical benchmark; production load/cache was uncontrolled. Wall-time and SQL-time columns must not be directly compared as like-for-like.

| Trial | Measurement | Observed time |
| --- | --- | ---: |
| Original actual RPC | Client-process wall (includes startup/network) |10,770ms |
| Actual RPC force_custom_plan | Client-process wall (includes startup/network) |7,965ms |
| Original expanded constants | SQL execution |3,023ms |
| Raw context IN sets | SQL execution |9,722ms |
| Raw IN with TIMING ON | Instrumented SQL execution |8,739ms |
| Materialized context IDs + nestloop on/custom | SQL execution |9,232ms |
| Familiar IDs first + EXISTS | SQL execution |11,856ms |
| Familiar IDs first + indexed EXISTS OFFSET0 | SQL execution |7,132ms |

These trials do **not** prove a sufficiently fast semantics-preserving correction. Set-based replacement, custom planning and changing the join strategy alone were insufficient. No SQL migration/schema edits were performed. Stop expensive production variants and reproduce with representative material/history in isolation before proposing a rollout.

Separate small scan controls (same read-only guard; database host class remote Supabase cloud): word_entries count66.726ms, active bindings259.829ms, all content nodes540.537ms, exact active-example diagnostic_locator regex count3,254.081ms. This isolates substantial regex-predicate cost over source nodes; it does not prove the whole RPC cost comes from that predicate. NUC idle/load does not describe the remote database host.

TIMING ON raw-IN plan showed source corpus scans taking seconds:18,224word-entry scan2,516ms,18,203active-binding scan1,636ms,40k example-predicate scan3,104ms. Plans and scripts retained as `performance-production-context-*` and `performance-production-scan-baseline-*`; UUIDs in emitted plans were redacted. Internal sampling uses owner claims matching each read; it does not impersonate a browser request using a printed identifier.
