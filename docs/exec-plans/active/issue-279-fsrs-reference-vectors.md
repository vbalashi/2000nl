# Issue #279 — pinned FSRS-6 reference vectors

Status: implementation slice after #294, 2026-09-12. Migration 150 aligns the
interday formula with the pinned reference without changing review history or
existing card state.

## Evidence contract

The pinned comparison target is Anki 25.07.5 with fsrs-rs v4.1.1
(`aeb6a0b71e02c8e882b22c7ad6953012425d78d3`) and the default FSRS-6 parameters
already used by 2000NL. Each pinned vector records the grade sequence, integer
`days_elapsed`, and expected memory state. The broader corpus also contains
characterization cases for application history and time boundaries.

The TypeScript and PostgreSQL implementations must agree with each other for
every vector. The product approval for the interday alignment is recorded in
issue #279 and implemented by migration 150. Values from before migration 150
remain in the research baseline as historical evidence, not current
expectations.

## Added in this slice

- `existing-memory-again-interday`: probes the pinned interday Again lower
  bound (`max(stability_after_failure, previous stability / exp(w17*w18))`).
- `existing-memory-again-interday-recover`: carries that state into the next
  Good so a later decision cannot hide the first mismatch.
- Both vectors require SQL↔TypeScript agreement against the pinned reference,
  including the application reps and lapse counters. These counters describe
  the application model state and are not claimed to be Anki scheduler history.
- `learningClassification.test.ts` directly characterizes the review RPC's
  application history contract (it is not a V2 HTTP/action-envelope test):
  the first Again on a card with no FSRS memory is logged as `new` with
  `reps=1/lapses=1`; an Again after an existing interday memory is logged as
  `review` with the prior memory retained and `reps=2/lapses=1`.
- This is a characterization of the current server behavior, not a scheduler
  formula change. The test corpus still keeps New→Again separate from an
  existing-memory Again so later product decisions cannot blur the two paths.
- Six additional vectors cover `Hard`, `Good`, and `Easy` after exactly one
  and five elapsed scheduler days and now verify the aligned runtime values.
- `trainingCalendarBoundaries.test.ts` pins the existing named-timezone date
  conversion helper at local midnight before and after both Europe/Amsterdam
  DST transitions. This is a lower-level calendar evidence slice: it does not
  claim to prove the FSRS `same_day` or full scheduler rollover path, which
  still needs a deterministic clock seam. Scheduler formula and persisted card
  state remain unchanged.

## Remaining scope

1. if required for the FSRS same-day branch, a separate timezone-aware
   scheduler-day rollover contract; the current 04:00 boundary already governs
   queue selection and statistics;
2. the `0.5`-day interval boundary, including the layer that rounds the raw
   FSRS interval for display and due scheduling;
3. a separate product decision on FSRS short-term scheduling versus Anki-style
   Learning Steps, if that policy is later changed.

Migration 148, delivered from the #290 temporal slice, now provides a
transaction-local deterministic clock at the real SQL test boundary. Use it
for these cases; do not set the host clock or duplicate the scheduler in a
test helper. Migration 150 is the only formula migration in this slice; it
preserves the transaction-local clock seam from migration 148 and does not
change migration 131 or historical data.

## Gates

- pinned source location and expected values are documented in
  `docs/research/fsrs-learning/fsrs-parity-baseline.md`;
- `apps/ui/tests/fsrs/fsrsParity.test.ts` passes with SQL↔TypeScript parity and
  checks the accepted interday reference vectors;
- full FSRS/DB tests, typecheck, and UI tests pass before publishing a PR;
- ADR-0010 records the accepted formula decision and compatibility boundary;
  the deployment postflight is the rollout gate for migration 150.
