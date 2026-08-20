# Issue 192 — Training critical-path remediation evidence

Exact deployed base: `9faff21e23098a286811991026787987aaad1aa1`.
The two JSON artifacts were produced from separate worktrees with the same
authenticated browser harness, fixture entries, desktop/mobile profiles, 20
accepted transitions per profile, zero transition-delay injection, and an
80 ms deterministic delay on each independent bootstrap read. Each report
contains a SHA-256 identity for the relevant source set and its patch.

## Performance budget

- accepted action → ready card: p95 below 1,000 ms and max below 1,000 ms;
- one `get_training_scenarios` request per Training bootstrap;
- zero unclassified events at or above 1,000 ms.

The base is red because it resolves the scenario catalog again on ordinary
card selections. The WIP is green because one bootstrap-owned catalog is shared
by Today and turn selection, invalidated on scope revision, and retried after a
rejected request.

| Profile | Exact base scenario RPCs | WIP scenario RPCs | Base p50 / p95 / max | WIP p50 / p95 / max |
| --- | ---: | ---: | --- | --- |
| Desktop | 45 | 1 | 105.1 / 108.6 / 109.8 ms | 11.8 / 14.2 / 15.2 ms |
| Mobile | 46 | 1 | 103.6 / 105.5 / 105.8 ms | 11.7 / 13.6 / 14.6 ms |

These values include the same synthetic 80 ms scenario-read delay in both
runs; the improvement is removal of repeated serial reads, not a claim that an
injected delay disappeared. The separate 1,100 ms transition injection remains
the red-path proof described in the runbook.

## Startup-read contract

Authentication is the prerequisite gate. Once authenticated, preferences,
active-scope hydration, and scenarios are independent effects. The harness
delays all three equally and asserts that their measured intervals overlap.
The WIP overlap was 109.9 ms on desktop and 102.9 ms on mobile, so no speculative
startup parallelization was added.

Artifacts:

- `baseline-9faff21e.json` — detached exact-base worktree, expected red;
- `wip-464a9174.json` — current uncommitted issue worktree, expected green.

This is deterministic local evidence. It neither accesses production nor
claims production backend percentiles.
