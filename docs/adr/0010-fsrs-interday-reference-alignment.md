# ADR-0010: Align interday FSRS calculations with the pinned reference

- Status: Accepted
- Date: 2026-09-12
- Decision owner: product owner, recorded in issue #279

## Context

The TypeScript and PostgreSQL FSRS-6 implementations agreed with each other,
but their interday stability calculation differed from the pinned
`fsrs-rs` v4.1.1 reference. The old implementation updated difficulty first
and then used that new difficulty to calculate stability. Interday `Again`
also had no reference lower bound. This made the lapse path collapse stability
more than the reference scheduler and made the implementation drift harder to
spot in review.

The change must not rewrite existing learner progress, review history, or
already scheduled timestamps. The correction is for calculations performed
after rollout.

## Decision

For an existing FSRS memory on an interday review:

1. Calculate the new difficulty, but calculate the new stability from the
   difficulty that existed before the review.
2. For `Again`, apply the reference floor:
   `max(stability_after_failure, previous_stability / exp(w17 * w18))`.
3. Keep the existing same-scheduler-day short-term branch unchanged.
4. Keep the existing application semantics for reps, lapses, Known state, and
   review history.
5. Do not recalculate historical FSRS state or move an existing
   `next_review_at`.

The learner-local 04:00 study-day boundary remains the authority for training
statistics and queue/date-window attribution. This ADR changes the interday
FSRS formula, not the persisted study-day counters or the product's separate
short-term/Learning Steps policy.

## Implementation

- TypeScript: `apps/ui/lib/fsrsMath.ts`.
- PostgreSQL: migration 150, `db/migrations/150_fsrs_interday_reference_parity.sql`.
- Deployment contract: `2000nl-db-150` with a direct postflight vector gate.
- SQL↔TypeScript parity corpus and the pinned interday vectors are covered by
  `apps/ui/tests/fsrs/fsrsParity.test.ts`.

The recovery vector is recorded as `S=4.228452`. The previously documented
`4.235313` value was produced by feeding post-review difficulty into the
recovery calculation, so it was corrected when the reference formula was
implemented.

## Consequences

Future interday reviews follow the pinned reference more closely, while all
existing progress remains intact. The SQL and TypeScript implementations must
continue to move together; any future change to the pinned scheduler version
requires new vectors and a new decision record.

Reference: [fsrs-rs v4.1.1 model implementation](https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/v4.1.1/src/model.rs).
