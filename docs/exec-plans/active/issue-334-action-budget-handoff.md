# #334 implementation handoff

GitHub [#334](https://github.com/vbalashi/2000nl/issues/334) owns live status.
Accepted contract: [ADR 0008](../../adr/0008-training-session-action-budget.md).
This handoff specifies work to perform; it does not claim implementation.

## Starting evidence

Base inspected: d8fb99e77 (includes #350 and deployment hotfix #351).
Branch: codex/334-action-budget-sessions. Project-local checkout:
`/Users/khrustal/dev/2000nl/.worktrees/334-action-budget-sessions`.
The only code change so far is a deliberately failing test in
`apps/ui/tests/fsrs/trainingSessionPlanRpc.test.ts`: size 5 with daily new limit
1 returns plannedTotal=1 instead of 5. Keep this regression; it remains valid.

An isolated local test DB was created as `codex_issue334_session` on port 54322.
Verify its existence and ownership before reuse; never reset the populated QA DB.
UI dependencies are installed separately in this worktree.

## What to change

1. Separate requested session size, accepted action count, pending candidates
   and completion/exhaustion state. Reuse atomic receipts and consumption from
   migrations 134/136; do not add an independent browser counter.
2. Make session planning and creation use the same candidate policy without
   daily capacity gates. Inspect migration 128's candidate function, 127's
   optimized plan, and 132/133's size and membership logic. Preserve access,
   Known, hidden/frozen, selected scope and due-time rules. Audit actual callers
   before changing signatures; do not blindly preserve every historical overload.
3. Apply new_review_ratio when constructing/advancing server session order.
   The existing frontend helper is `apps/ui/lib/training/trainingQueue.ts`.
   `selectionService.ts` bypasses queueTurn when trainingSessionId is present;
   start_training_session currently asks for auto order. Therefore the existing
   UI ratio control alone does not prove session mixing. Keep one ordering owner.
4. Stop at N accepted actions. A skipped/unavailable member consumes zero;
   preserve stable identities for pending members and use explicit mutation for
   replacement if needed. Prevent duplicate or extra actions around completion,
   prefetch, reload and retry. Distinguish eligible-pool exhaustion from N reached.
5. Wire requested size through settings/start/plan/resume and return truthful
   progress. `useTrainingSessionPresentation.ts` currently uses consumed+1;
   #325 fixed replacement increments but did not implement 0/N. Correct this
   under #334 without reopening the historical recovery issue.
6. Verify Today projections count unique enrolled meanings. #328 pairs state
   but did not itself establish all statistics acceptance criteria; inspect
   migration 130/read models rather than assuming direction deduplication.
7. Update active contract docs and append the next migration/manifest/probes
   after checking the current main sequence. Visual layout and new controls need
   scoped #331 approval. Do not invent a new completion design in this task.

## Required behavioral evidence

- N=10, ratio 1:5: new + 5 reviews + new + 3 reviews; N=50 stops at 50.
- Ratios 1 through 5; new-only/review-only; exhausted category fallback only
  within allowed mode; both pools exhausted before N.
- Two same-day sessions past old daily new AND review limits, using actual
  session/action RPCs. Test default, list and history/source-filtered scopes.
- Learn, Known, Good and Again count once; another direction counts separately.
  No fabricated sibling review or enrollment. Unique-meaning Today totals.
- Resume after an accepted action, duplicate receipt, failed next load,
  unavailable replacement, prefetch around the last action and empty pool.
- Again respects due time and does not auto-extend or force replay.
- Existing learning/FSRS/history preserved, including asymmetric state fixtures.
- DB postflight and migration against populated representative legacy fixtures;
  fresh bootstrap alone missed #328's deployment failure.
- Relevant UI/RPC suites, typecheck, lint, contract/performance gates and review.
  Verify PR checks AND post-merge deploy/exact production health before declaring
  release complete. Do not infer successful rollout from merge alone.

## Delivery order and ownership

#325 and #328 are integrated predecessors, not open blockers. Deliver #334
first, with #290 supplying composed behavior evidence. Then shape #330's sparse
content policy and implement #330 before #329's sequential introductions.
Serialize their scheduler/migration edits. #331/#298 cover approved presentation
and naming; #334 owns numeric truth. #332 owns legacy idiom routing plus usable
replacement and preserved progress; #330 must not silently remove those idioms.
#333 follows a shared, agreed exercise identity boundary with #332.
#195 remains prompt-policy work; #336/#339/#341 are completed investigation and
repair predecessors. No new universal exercise engine is required for #334.

Owner waived compatibility with old session snapshots, not FSRS preservation.
Do not spend this slice on versioned old-session migration. The user will launch
the next agent; no autonomous agent execution is requested by this handoff.
