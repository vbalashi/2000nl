# Issue #279 — pinned FSRS-6 reference vectors

Status: evidence slice after #294, 2026-09-11. This plan deliberately does
not change scheduler formulas, review history, or existing card state.

## Evidence contract

The pinned comparison target is Anki 25.07.5 with fsrs-rs v4.1.1
(`aeb6a0b71e02c8e882b22c7ad6953012425d78d3`) and the default FSRS-6 parameters
already used by 2000NL. Each pinned vector records the grade sequence, integer
`days_elapsed`, expected memory state, and whether the current runtime matches
or exposes an observed pending mismatch. The broader corpus also contains
characterization cases whose expected reference state is still to be added.

The TypeScript and PostgreSQL implementations must agree with each other for
every vector. A known deviation is not treated as parity and is not a runtime
change request; it is a visible, pending product decision point with no
approval recorded yet.

## Added in this slice

- `existing-memory-again-interday`: probes the pinned interday Again lower
  bound (`max(stability_after_failure, previous stability / exp(w17*w18))`).
- `existing-memory-again-interday-recover`: carries that state into the next
  Good so a later decision cannot hide the first mismatch.
- Both vectors characterize the existing SQL/TypeScript deviation against the
  pinned reference while requiring SQL↔TypeScript agreement, including the
  observed interval, reps, and lapse counters. These counters describe the
  application model state and are not claimed to be Anki scheduler history.
- `learningClassification.test.ts` directly characterizes the review RPC's
  application history contract (it is not a V2 HTTP/action-envelope test):
  the first Again on a card with no FSRS memory is logged as `new` with
  `reps=1/lapses=1`; an Again after an existing interday memory is logged as
  `review` with the prior memory retained and `reps=2/lapses=1`.
- This is a characterization of the current server behavior, not a scheduler
  formula change. The test corpus still keeps New→Again separate from an
  existing-memory Again so later product decisions cannot blur the two paths.
- Six additional vectors cover `Hard`, `Good`, and `Easy` after exactly one
  and five elapsed scheduler days. They record the pinned reference values
  alongside the current runtime observation, making the pre-review-difficulty
  deviation visible without changing it.
- `trainingCalendarBoundaries.test.ts` pins the existing named-timezone date
  conversion helper at local midnight before and after both Europe/Amsterdam
  DST transitions. This is a lower-level calendar evidence slice: it does not
  claim to prove the FSRS `same_day` or full scheduler rollover path, which
  still needs a deterministic clock seam. Scheduler formula and persisted card
  state remain unchanged.

## Remaining evidence before any formula decision

1. scheduler-day rollover at local midnight with explicit timezone/DST cases;
3. the `0.5`-day interval boundary, including the layer that rounds the raw
   FSRS interval for display and due scheduling;
4. a separate product decision on FSRS short-term scheduling versus Anki-style
   Learning Steps, based on the supplied research and current observability.

These cases need deterministic clocks/timezones at the test boundary. Do not
set the host clock or duplicate the scheduler in a test helper. Until the
remaining vectors and product decision are complete, do not modify migration
131 or the TypeScript FSRS formula.

## Gates

- pinned source location and expected values are documented in
  `docs/research/fsrs-learning/fsrs-parity-baseline.md`;
- `apps/ui/tests/fsrs/fsrsParity.test.ts` passes with SQL↔TypeScript parity and
  makes known deviations explicit;
- full FSRS/DB tests, typecheck, and UI tests pass before publishing a PR;
- only after owner review may a separate implementation issue propose runtime
  alignment or an intentional documented deviation.
