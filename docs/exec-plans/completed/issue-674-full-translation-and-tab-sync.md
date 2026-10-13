# #674 — Full translation and tab synchronization

Accepted source: ../../discussions/2026-10-13-03-full-translation-and-tab-sync.md.
Owner: current Codex session. Worktree .worktrees/674-full-translation-sync.

- [x] Reproduce full inventory omission/truncation and missed cross-tab invalidation with red regressions.
- [x] Separate source inventory from bounded provider request; deterministic semantic/context partitions, long-field segmentation, exact aggregate field coverage and versioned identity.
- [x] Persist successful parts under fenced job ownership, resume after failure/restart, bounded continuation and atomic final publication; additive private DB contract with real Postgres tests.
- [x] Integrate worker, synchronous compatibility path, read-only V1/V2 freshness/coverage, preserve small-card single-request behavior and frozen learning state.
- [x] Cross-tab public invalidations with no echo and safe fallback; authoritative visible-card revalidation on focus/visibility/periodic recovery; cancellation/deduplication.
- [x] Focused regressions, typecheck/lint, full unit/API/browser validation; independent standards/spec reviews; resolve findings.
- [x] Reviewed PR, CI, coordinated manifest-gated deployment, exact health/image/worker and bounded large-card smoke, rollback verification.
- [x] Record release/evidence and preservation/retirement handoff (final receipts in the external archive).

Acceptance: ready never describes a truncated inventory or missing required field. Part identities include exact source/policy; stale owners cannot save or publish. Duplicate clients share existing jobs; completed parts survive retries. Cross-tab messages are hints only, no translation/private state; missing events recover by authoritative checks. Provider errors remain honest pending/failed states. No bulk backfill or learning mutation.

Implementation checkpoint: inventory red regression reproduced161 expected vs22 actual; cross-tab red regression reproduced0 deliveries in second tab. Focused regressions now pass, including Unicode no-source-loss partitioning, multiple legacy meanings, late context display, actual worker subprocess restart, persisted part resume and server/private RPC fences. Real Postgres369 tests passed; browser two-tab BroadcastChannel and storage fallback passed. Local contract224 applied via managed gate and health ok/local. Full suite and independent reviews are running.

Freshness contract: exact current source/policy on every authoritative read and atomic publication; cross-tab invalidation triggers read, focus/visibility revalidates, visible recovery checks at most60s apart. Offline/provider failure cannot promise a completion deadline. Normal full-source mode never labels missing inventory ready. Emergency rollback deliberately restores previous v3 semantics in the compatible224 image; reviewed full code revert retains224. Successful parts remain with their owning job for repair/retry, cascade on job/source deletion, and are service-role-only.

Review checkpoint: Standards found no architectural breach. Spec found two recovery gaps: settled pending/failed clients did not resume new preparation while repair remained true; null ordinary headword could poison durable parts. Fixed by typed authoritative refresh results followed by normal deduplicated preparation (also Library), and mandatory ordinary headword validation before checkpoint/reuse. Focus/policy-change and failed/poisoned-part retry regressions cover both.127 focused checks and typecheck passed after fixes; final full rerun and reviewer confirmation pending.

Final integration checkpoint: null-headword validation also preserves explanation-only repair through an explicit headword-not-required patch contract, followed by full final validation. Collapsed/changed Library meanings do not start hidden preparation during background recovery. Guidance drift range updated to224. CI ECR mirror repeatedly rejected PostgreSQL image pulls (HTTP rate limit), so drift job uses the same official postgres:17 image as the already-passing FSRS job.52 focused recovery/repair tests and typecheck passed.

Final local validation:2331 unit/API tests passed (357 skipped),369 real PostgreSQL tests passed,5 browser scenarios passed, typecheck and lint passed (existing audio dependency warning). Deployment gate unit regression updated to224; all integration client image pulls use the same official postgres:17 image. Spec reviewer confirmed both original P1 findings resolved; final small integration recheck requested.

Reviewed implementation PR #687 merged at f670d6b7cfddc47799a41279f7efdb8d969f4d5c. All CI checks passed:2331 unit/API, platform API smoke, browser218+29+17, DB drift/contract, FSRS, security, guidance and release boundary. Independent final integration recheck found no blocking issue. Official CI PostgreSQL client is immutable digest-pinned; no gate relaxed. Deployment38446942718 is in progress; production completion is not yet claimed.

## Verified production release — 2026-10-13

PR #687 merged at f670d6b7cfddc47799a41279f7efdb8d969f4d5c; deployment38446942718 succeeded. Production0.18.1286 reports exact commit, compatible224 and healthy worker; UI/worker share that image, full-source true and luna6 profile. Promptv11 fingerprint remains6a0e11c8e9f54e90ceea0208424373b55b8f7e06d65ccf58a131b6a871d522c6.

Bounded normal-queue smoke for public NT2 hand (904aa267-20e6-47c8-a0ad-0dc36358bcdd): job4f52a632-9d07-4b8d-b406-684fe749b36d queued → running → ready on attempt1, one persisted part, current v4 artifact and actual64/64 fields, no missing fields. This source fits one bounded call; over-budget161-field/long-Unicode/multiple-meaning segmentation and multi-part resume are covered locally, not claimed as a production multi-part smoke. No canonical source mutation, learner action, bulk regeneration or broad linguistic comparison.

Evidence: /Users/khrustal/adhoc/2000nl-research-archives/674-full-translation-sync-2026-10-13/. Reference synchronization and checkout retirement follow the documentation checkpoint merge; branch refs preserve exact PR heads. Rollback procedure is documented and covered by identity/executor regressions; production was not toggled back during an active user session.
