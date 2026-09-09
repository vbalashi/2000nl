# FSRS-6 parity baseline

Status: implementation candidate in PR #282. Migration 131 aligns the
same-scheduler-day stability update in TypeScript and SQL with the pinned
reference vectors. The online system remains on contract 130 until review and
rollout are complete.

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

The SQL observation was reproduced against the local database after migration
130 with a first `Good`, followed immediately by a second `Good` using the same
timestamp. Migration 131 adds the same-day branch and successful-grade clamp to
both implementations. The parity suite now covers the initial four grades,
same-day `Good/Hard/Again`, and `Again → Good` and compares both implementations
with the pinned reference vectors.

## What remains to be measured

The following remain outside migration 131 and require a separate decision or
follow-up issue:

1. initial `Again`, `Hard`, `Good`, and `Easy`;
2. same-day repeated `Again`, `Hard`, `Good`, and `Easy`;
3. `Again → Good` on the same scheduler day;
4. an interday transition with exact integer `days_elapsed`;
5. the `New → Again` versus `Review → Again` lapse counter distinction;
6. scheduler-day rollover and time-zone/DST boundaries;
7. short-term threshold and interval rounding around `0.5` days.

Migration 131 intentionally does not change scheduler-day rollover/time-zone
calculation, Learning Steps, or review-history storage. It also does not
rewrite existing cards; it only makes future same-day computations use the
same formula in SQL and TypeScript.
