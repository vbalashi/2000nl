# Issue #711: Training start timeout diagnosis (2026-10-16)

## Production signal

Sanitized aggregated logs for the two new-user reports showed `start_training_session` HTTP 500 responses at 17:24:00Z (9.040 s) and 17:32:41Z (8.728 s), with SQLSTATE `57014` and static class `statement_timeout` at 17:23:59Z and 17:32:41Z. The exact 17:32:41Z server context included whitelisted routine-name flags for claim, latch, members, and scheduler; translation nodes were absent. Request/response bodies, SQL text, raw errors and account identifiers were not retained. A separate three-start QA check succeeded (5.213 s, 0.754 s, 7.656 s), which does not negate the captured failures.

## Local falsifiable test

A disposable local FSRS database held an 18,000-row source-bound corpus in the canonical dictionary, word-entry, source-binding, and content-node tables. The fixture verified 4,500 first meanings, 13,500 later meanings, 18,000 active examples, and zero unrenderable entries. All fixture writes ran in a transaction and rolled back; the disposable database was dropped. The durable manual harness is `apps/ui/scripts/manual/issue-711-scheduler-bench.test.ts`; `apps/ui/scripts/manual/issue-711-scheduler-benchmark.md` gives the exact guarded command. It is outside the routine test tree and rejects non-loopback or non-disposable DB URLs.

The test exercised the installed `private.training_scheduler_candidates_v2` function, changing only `enable_nestloop`:

| Scope | Baseline | `enable_nestloop=off` preference | Selected result parity |
| --- | ---: | ---: | --- |
| 18k New | 7.209 s | 0.303 s | Same 4,500 identities and `new` category |
| 100-entry curated list | 71 ms | 78 ms | Same 25 identities and `new` category |
| 18k Review | 11.288 s | 0.277 s | Same 4,500 identities and `learning` category |

This supports the scheduler’s materialized first-meaning relation as a measured hot path. It does not prove the production cause by itself or substitute for post-release production validation.

## Proposed database change and rollout gate

Migration 227 adds only `enable_nestloop=off` to the scheduler function configuration. This discourages nested-loop plans; it does not force a hash join. It leaves global planner settings unchanged and does not increase the timeout or add retries. The setting mirrors the already-existing availability projection, which uses the same eligibility prefix to avoid the one-row estimate / quadratic nested-loop behavior.

PR #718 separately adds truthful manual retry UI and binds retry context to its original user and language. That UI does not correct the scheduler timeout.

Migration 226 is owned by PR #719 and is not in this branch’s base. Therefore this work is a held draft: migration 227 is not appended to the managed contract manifest, not added to bootstrap, and not eligible for rollout until 226 is merged and the contiguous manifest/checksum/postflight contract can be constructed from that state. The database drift check is expected to reject the gap (it expects 226, finds 227, and does not find 227 in bootstrap); release-boundary validation is also expected to reject deployment while the manifest remains unchanged. These are intentional blocking checks; `Release-Ready: no` remains in effect. The local FSRS test helper discovers migration files directly, so its migration-227 assertion does not establish that bootstrap or the release contract is complete. There is no production migration or deployment in this report.
