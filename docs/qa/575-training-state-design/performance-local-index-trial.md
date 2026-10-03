# Exact example-predicate partial index: isolated proof

Local PostgreSQL17.6 disposable database `2000nl_fsrs_575_index_trial`; canonical local database and production unchanged. Cloned real locally imported18,163entries/40,403content nodes and installed208functions, then added synthetic history for500meanings×2directions (1,000answered states), half overdue and half due later. No production data/history export. Local QA data stays in disposable local clone; emitted JSON contains counts/plans only.

Index: B-tree entry_id on private.platform_v2_content_nodes with **exact174predicate** kindexample, binding_stateactive, nonblank diagnostic_locator and raw.meanings[index].examples[index] regex. No eligibility predicates changed. Clone-only index build approximately22ms in first trial.

| Scope | Before median | After median | Counts due / reviews / new (both stages) |
| --- | ---: | ---: | --- |
|4031-entry curated context reverse |120.65ms |105.62ms |211 /416 /0 |
|4031-entry curated ordinary both |119.11ms |118.31ms |492 /979 /2030 |
|All-dictionary ordinary both, same synthetic learner |373.19ms |385.05ms |492 /979 /13564 |
|Largest curated context reverse (separate synthetic learner) |388.71ms |309.23ms |157 /329 /0 |

Each stage has first+5warm actual authoritative RPC calls; table medians use5warm. No meaningful p95 claim for this small sample. Before/after counters exactly match. Ordinary timing changes are small/noisy and should not be marketed as a speedup.

Exact predicate scan4031trial:48.679ms SeqScan before,0.682ms IndexOnlyScan after. Broadtrial:49.331ms→0.618ms. This proves the physical index serves the expensive regex eligibility predicate and a modest12–20% localcontextRPC improvement. **It does not prove production counts become subsecond**: production has different remote hardware/load/history and observed regex scan3.25seconds; end-to-end latency also includes API/network. No production index was created by this agent.

Reproduction harness `performance-local-index-trial.cjs` refuses no production connection because its local disposable URL is hardcoded. Run from apps/ui after preparing a localclone with208,pg_trgm, source corpus, and no trialindex. It creates synthetic users/history, measures, then creates index only in that disposable clone. Resultfiles `performance-local-index-trial-results.json` (4031curated) and `performance-local-index-trial-all-results.json` (largestcurated) retain rawtimings and completepredicateplans. The earlier failedrestore required pg_trgm inpublic followed by remainingindex/constraint replay; only psql terminal unrestrict warning remained. No failedrestore was used for results.

DB retained temporarily for DBworker209validation; worker must drop it after validation. Temporary localdump files removed; no corpus/auth dump is committed. Any eventual migration requires SQLsemanticparity tests/postflight/manifest plus actualproductionmeasurement after separately authorized rollout.
