# FSRS-6 parity baseline

Status: characterization only. This document records the first comparison for
issue #279; it does not change scheduling behavior.

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
| Good → Good, same scheduler day | `S=2.306500` (short-term result clamped not below prior `S`) | `S=2.293814`, `D=2.111214` | `S=2.306500`, `D=2.111214` because the regular path sees elapsed `0` |
| New → Again, first grade | `S=0.212000`, `D≈6.413300`; not a mature lapse | initial values are available through `fsrs6_compute` | initial values are available through `fsrsCompute` |

The SQL observation was reproduced against the local database after migration
130 with a first `Good`, followed immediately by a second `Good` using the same
timestamp. The relevant SQL branch applies the same-day formula but does not
apply the reference clamp for successful grades. The TypeScript helper does not
have a dedicated same-day branch; it therefore does not match the reference for
same-day `Hard` and other short-term cases even where the `Good` value happens
to stay unchanged.

## What remains to be measured

Before any runtime change, the parity suite must add vectors for:

1. initial `Again`, `Hard`, `Good`, and `Easy`;
2. same-day repeated `Again`, `Hard`, `Good`, and `Easy`;
3. `Again → Good` on the same scheduler day;
4. an interday transition with exact integer `days_elapsed`;
5. the `New → Again` versus `Review → Again` lapse counter distinction;
6. scheduler-day rollover and time-zone/DST boundaries;
7. short-term threshold and interval rounding around `0.5` days.

The first implementation decision is intentionally deferred: either both
implementations are brought to the pinned reference, or a documented product
deviation is approved. No scheduler or user-history migration should be
merged as part of the characterization step.
