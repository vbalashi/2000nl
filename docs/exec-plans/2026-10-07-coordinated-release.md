# Coordinated publication audit — 2026-10-07

Owner explicitly requested auditing unpublished work, merging ready changes
and publishing one combined release. Production and origin/main initially both
reported 23474e8d5d75993f3f333cb0c4bcfb4e1c588559, database contract 211.
All local worktrees and nine open PRs were inspected.

## Included

- #528 local commits: training face direction/target, launch transition,
  account animation/gesture preferences and approved Appearance controls.
- PR #604: Library audio before translation, consistent with Training.
- PR #515: reviewed Van Dale POS parser correction; no corpus import or
  production data correction is run as part of this publication.
- PR #593: morphology onboarding guidance.
- PR #257: historical Answer design measurements (documentation/assets).
- PR #447: local schema preflight, preserving current QA source checks and
  both integration tests in the workflow conflict resolution.
- Unpushed main commit c40069d4: SMTP maintenance helper scripts. Included as
  source only; no mail sent and no scheduler configured.
- Release validation repairs: sharp 0.35.5 override (GHSA-wq5f-xc86-pv6w),
  update header ordering e2e assertions, current migration range in guidance,
  structural publication probes in the read-only postflight chain. Original
  write-capable postflight and its characterization checks are unchanged.

## Not ready or superseded

- #406: historical translation consumer using migration 156. Current consumer
  was rebuilt on migration 166 and published; merging this old branch would
  restore obsolete contracts. Retain for explicit historical cleanup.
- #556: draft admin UI with pending visual/Google walkthrough, overlaps
  published #572. Do not roll back current users navigation or auth validation.
- #444: draft diagnostics explicitly awaiting architecture and evidence gates.
- #144: draft lexicography evaluation awaiting blind owner review.
- Non-PR branches with older idiom/session/latency commits are historical
  alternatives predating published successors; ahead counts alone are not
  evidence of missing functionality. #469 ontology document is an unreviewed
  product proposal; current corpus/editor research #603 remains active.
- Uncommitted ingestion path normalization in #252; reference-checkout research
  and AGENTS edits; prototype/QA screenshots; #603 research scripts/data and
  experimental prompts remain in their owning worktrees. No arbitrary dirty
  files or restricted corpus artifacts are collected into this release.

## Validation

2067 UI unit/component tests passed (339 existing skips); 351 DB tests passed;
19 Van Dale POS regression tests passed. Typecheck passes. Lint retains the
existing handlePlayAudio hook warning. Production dependency audit reports no
findings. Deployment contract validates as enabled 212. Local read-only check
passes after correcting the publication probe chain. CI and deployment receipt
are recorded below when complete.
