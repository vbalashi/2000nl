# #674 — Full translation and tab synchronization

Accepted source: ../../discussions/2026-10-13-03-full-translation-and-tab-sync.md.
Owner: current Codex session. Worktree .worktrees/674-full-translation-sync.

- [ ] Reproduce full inventory omission/truncation and missed cross-tab invalidation with red regressions.
- [ ] Separate source inventory from bounded provider request; deterministic semantic/context partitions, long-field segmentation, exact aggregate field coverage and versioned identity.
- [ ] Persist successful parts under fenced job ownership, resume after failure/restart, bounded continuation and atomic final publication; additive private DB contract with real Postgres tests.
- [ ] Integrate worker, synchronous compatibility path, read-only V1/V2 freshness/coverage, preserve small-card single-request behavior and frozen learning state.
- [ ] Cross-tab public invalidations with no echo and safe fallback; authoritative visible-card revalidation on focus/visibility/periodic recovery; cancellation/deduplication.
- [ ] Focused regressions, typecheck/lint, full unit/API/browser validation; independent standards/spec reviews; resolve findings.
- [ ] Reviewed PR, CI, coordinated manifest-gated deployment, exact health/image/worker and bounded large-card smoke, rollback verification.
- [ ] Record release/evidence, reference sync and worktree retirement.

Acceptance: ready never describes a truncated inventory or missing required field. Part identities include exact source/policy; stale owners cannot save or publish. Duplicate clients share existing jobs; completed parts survive retries. Cross-tab messages are hints only, no translation/private state; missing events recover by authoritative checks. Provider errors remain honest pending/failed states. No bulk backfill or learning mutation.
