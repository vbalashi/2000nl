# FSRS-6 parity baseline

Status: evidence slice for issue #279 after migration 131 and the #294 session
membership rollout. Migration 131 aligns the same-scheduler-day stability
update in TypeScript and SQL with the pinned reference vectors. The online
system is on contract 137; no new FSRS formula change is included here.

## Pinned reference

- Anki scheduler source: [25.07.5 `learning.rs`](https://github.com/ankitects/anki/blob/25.07.5/rslib/src/scheduler/states/learning.rs)
- FSRS implementation: [fsrs-rs `v4.1.1`](https://github.com/open-spaced-repetition/fsrs-rs/tree/v4.1.1), commit `aeb6a0b71e02c8e882b22c7ad6953012425d78d3`
- Default model: FSRS-6, 21 parameters, desired retention `0.90`
- Scheduler-day input: integer `days_elapsed`; intraday learning uses `delta_t = 0`
- Short-term stability: enabled in the reference model

## First observed vectors

The initial state uses the default 21 parameters already present in
`fsrs6_parameters()` and `apps/ui/lib/fsrsMath.ts`.

| Transition | Reference expectation | Current SQL observation | Current TypeScript behavior |
| --- | ---: | ---: | ---: |
| New → Good, first grade | `S=2.306500`, `D≈2.118104` | `S=2.306500`, `D=2.118104` | same initial values |
| Good → Good, same scheduler day | `S=2.306500` (short-term result clamped not below prior `S`) | `S=2.293814`, `D=2.111214` before migration 131 | `S=2.306500`, `D=2.111214` after the parity branch |
| New → Again, first grade | `S=0.212000`, `D≈6.413300`; not a mature lapse | initial values are available through `fsrs6_compute` | initial values are available through `fsrsCompute` |
| Existing FSRS memory → Again after 1 day | `S=2.195161` (interday failure lower bound), `D≈7.394503` | `S≈0.529085`, `D≈7.394503` | same observed deviation |

The SQL observation was reproduced against the local database after migration
130 with a first `Good`, followed immediately by a second `Good` using the same
timestamp. Migration 131 adds the same-day branch and successful-grade clamp to
both implementations. The parity suite now covers the initial four grades,
same-day `Good/Hard/Again`, and `Again → Good` and compares both implementations
with the pinned reference vectors.

## What remains to be measured

The following remain outside migration 131 and require a separate decision or
follow-up issue:

1. an interday transition with exact integer `days_elapsed`;
2. the `New → Again` versus `Review → Again` lapse counter distinction;
3. scheduler-day rollover and time-zone/DST boundaries;
4. short-term threshold and interval rounding around `0.5` days;
5. the boundary between FSRS short-term scheduling and any product-level
   Learning Steps policy.

The initial `Again/Hard/Good/Easy`, same-day `Good/Hard/Again`, and
`Again → Good` vectors are covered by migration 131's parity suite. Additional
interday transitions remain to be measured.

The corpus now also includes an existing FSRS memory state followed by Again
after one interday day and the following recovery. The raw FSRS function does
not carry the scheduler's New/Review label; this vector therefore characterizes
model state rather than proving a UI history classification. fsrs-rs v4.1.1
applies a lower bound to interday Again, which the current SQL and TypeScript
paths do not yet apply. The tests keep this as an explicit known deviation
while requiring SQL↔TypeScript agreement; no runtime alignment is authorized
by #279's evidence slice.

Migration 131 intentionally does not change scheduler-day rollover/time-zone
calculation, Learning Steps, or review-history storage. It also does not
rewrite existing cards; it only makes future same-day computations use the
same formula in SQL and TypeScript.
