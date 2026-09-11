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
- The test corpus still includes New→Again separately, making the difference
  between initial Again and an existing-memory Again explicit. A true
  scheduler-history classification remains part of the evidence still needed.

## Remaining evidence before any formula decision

1. exact integer interday vectors for all grades and representative stability;
2. New→Again versus Review→Again history classification and lapse counters;
3. scheduler-day rollover at local midnight with explicit timezone/DST cases;
4. the `0.5`-day interval boundary, including the layer that rounds the raw
   FSRS interval for display and due scheduling;
5. a separate product decision on FSRS short-term scheduling versus Anki-style
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
