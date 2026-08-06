# Cross-Product SenseCard V1 Rollout Gate

Status: completed
Issue: `vbalashi/2000nl#79`
Branch: `codex/issue-79-cross-product-sensecard-gate`
Worktree: `/Users/khrustal/adhoc/2000nl-issue-79-cross-product-sensecard-gate`
2000NL base: `870bff926c3709be49550b69dcc25b795ab8f997`
AudioFilms base: `efe7aae771c0bb5f2b70cd8d30f732a25fb30ff5`

## Goal

Decide whether SenseCard v1 can move from repository-owned tracer slices to a
broader, reversible rollout using shared fixture evidence rather than visual or
semantic similarity by assumption.

## In Scope

- map equivalent single- and multi-sense fixtures across both products;
- compare translation off/on, sparse/rich, long-headword, new/learning/known,
  report, undo, and exceptional states;
- prove that every learning action still owns one stable entry/meaning target;
- record intentional context differences between 2000NL and the AudioFilms
  extension;
- capture responsive screenshots and accessibility evidence;
- obtain independent visual QA and product-owner approval;
- document rollout, rollback, and concrete follow-up issues.

## Out of Scope

- redesigning approved SenseCard anatomy;
- enabling feature flags in production;
- changing Platform V2 or parser contracts without a separately owned defect;
- implementing optional morphology/relations details;
- migrating additional 2000NL navigation destinations.

## Sequence

1. Inventory the exact fixture, semantic DTO, renderer, feature flag, and test
   surfaces in both repositories.
2. Build a state/identity matrix and mark missing or intentionally different
   evidence before changing code.
3. Run deterministic contract and interaction checks in both repositories.
4. Capture matched Full/Narrow screenshots at agreed viewports and run
   accessibility checks.
5. Fix only evidence-backed rollout blockers in their owning repositories;
   keep unrelated polish as follow-up.
6. Run independent visual QA, record product-owner decision, and publish the
   rollout/rollback recommendation.

## Rollback

This gate changes no production flag by itself. Existing repository flags stay
off until approval. Any rollout recommendation must name the exact flags and
show that disabling them returns to the current legacy renderers without data
or database rollback.

## Completion

The plan moves to `completed/` only after the cross-product matrix, validation
evidence, independent QA, owner decision, and follow-up ownership are all
recorded. A failed gate is a valid outcome if its blockers are explicit.

## Current checkpoint

- [x] Shared state and identity matrix recorded.
- [x] Deterministic contract and interaction checks pass in both repositories.
- [x] Full/Narrow, single/multi, translation and long-headword evidence captured.
- [x] Independent visual QA passes with no findings.
- [x] Rollout, rollback and follow-up ownership documented.
- [x] AudioFilms presentation approved by the product owner.
- [x] Recover the rejected 2000NL visual set against the explicit contract
      matrix: stable Training shell, shared headword/section chrome, correct
      Library per-sense controls and action hierarchy, and responsive long type.
- [x] Product-owner approval of synchronized 2000NL evidence recorded.
- [x] Both review-ready branches integrated and reverified on their main branches.

## Integrated result

- 2000NL merged main: `a0df9d690303386a3d0a477c04a2b43a16c35092`.
- AudioFilms merged main: `95c7b2fc56d9c295bed0f4533063edf6e7543347`.
- 2000NL exact-main validation: typecheck, lint, 60 test files passed,
  427 tests passed and 74 skipped; local browser Face → Hint → Answer smoke
  passed with no console errors.
- AudioFilms exact-main validation: extension unit smoke, changed JavaScript
  syntax checks, and diff check passed.
- Independent final visual QA: PASS across desktop, 390px, and 280px evidence;
  no High, Medium, or Low findings.
- Feature flags remain off. Rollout stays reversible and requires no database
  rollback.
