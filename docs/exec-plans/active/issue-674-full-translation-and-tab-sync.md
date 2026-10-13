# #674 — Full translation and tab synchronization

Accepted source: ../../discussions/2026-10-13-03-full-translation-and-tab-sync.md.
Owner: current Codex session. Worktree .worktrees/674-full-translation-sync.

- [x] Reproduce full inventory omission/truncation and missed cross-tab invalidation with red regressions.
- [x] Separate source inventory from bounded provider request; deterministic semantic/context partitions, long-field segmentation, exact aggregate field coverage and versioned identity.
- [x] Persist successful parts under fenced job ownership, resume after failure/restart, bounded continuation and atomic final publication; additive private DB contract with real Postgres tests.
- [x] Integrate worker, synchronous compatibility path, read-only V1/V2 freshness/coverage, preserve small-card single-request behavior and frozen learning state.
- [x] Cross-tab public invalidations with no echo and safe fallback; authoritative visible-card revalidation on focus/visibility/periodic recovery; cancellation/deduplication.
- [ ] Focused regressions, typecheck/lint, full unit/API/browser validation; independent standards/spec reviews; resolve findings.
- [ ] Reviewed PR, CI, coordinated manifest-gated deployment, exact health/image/worker and bounded large-card smoke, rollback verification.
- [ ] Record release/evidence, reference sync and worktree retirement.

Acceptance: ready never describes a truncated inventory or missing required field. Part identities include exact source/policy; stale owners cannot save or publish. Duplicate clients share existing jobs; completed parts survive retries. Cross-tab messages are hints only, no translation/private state; missing events recover by authoritative checks. Provider errors remain honest pending/failed states. No bulk backfill or learning mutation.

Implementation checkpoint: inventory red regression reproduced161 expected vs22 actual; cross-tab red regression reproduced0 deliveries in second tab. Focused regressions now pass, including Unicode no-source-loss partitioning, multiple legacy meanings, late context display, actual worker subprocess restart, persisted part resume and server/private RPC fences. Real Postgres369 tests passed; browser two-tab BroadcastChannel and storage fallback passed. Local contract224 applied via managed gate and health ok/local. Full suite and independent reviews are running.

Freshness contract: exact current source/policy on every authoritative read and atomic publication; cross-tab invalidation triggers read, focus/visibility revalidates, visible recovery checks at most60s apart. Offline/provider failure cannot promise a completion deadline. Normal full-source mode never labels missing inventory ready. Emergency rollback deliberately restores previous v3 semantics in the compatible224 image; reviewed full code revert retains224. Successful parts remain with their owning job for repair/retry, cascade on job/source deletion, and are service-role-only.
