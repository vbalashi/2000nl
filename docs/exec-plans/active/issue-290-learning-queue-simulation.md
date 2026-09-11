# Issue #290 — simulate real learning queue behavior

Status: execution plan, 2026-09-11. This document is preparation for the
first bounded simulation slice; it does not change queue, FSRS, or user-history
behavior.

## Why this is the next slice

The queue/session ownership work is now merged (#250, #294, and #311), and the
local database can be reused safely (#284). The first FSRS reference evidence
slice is merged in #279, but its remaining formula and scheduler-boundary
decisions are intentionally still open. The next useful proof is therefore
not another UI tweak: it is an executable trace of what a learner's cards do
across actions and days.

## What the simulation must prove

The harness must call the current application boundaries, not a second copy of
the scheduler:

- start a finite training session and read its latched membership;
- obtain the next member through the authoritative selector;
- send the real V2 action envelope with a stable idempotency/turn id;
- read the durable action receipt, card state, history, statistics, and next
  presentation;
- record exact `(entry_id, card_type_id, session_id, ordinal)` identity at each
  step and explain every exclusion or delay.

Each trace row should contain: presented card, user action, accepted receipt,
durable event, history/counter changes, computed due time, next presentation,
and an exclusion/delay reason. A failed next-card lookup must be recoverable
without sending a second grade.

## Dependency and clock boundary

The current diagnostic SQL is useful characterization but runs in one
transaction with wall-clock `now()`, uses direct SQL actions, and does not prove
the V2 envelope or passage of a scheduler day. Before temporal scenarios are
added, inventory every scheduler use of `now()`, `current_date`, and random
ordering. Introduce one reviewed test-time clock seam shared by the real SQL
boundaries; do not set the host clock, mutate the populated QA database, or
write a simplified scheduler just for tests. TypeScript and SQL observations
must continue to be compared against the same inputs.

## Bounded implementation order

1. **Trace fixture and identity:** disposable local database, two card
   directions, one test learner, structured JSONL trace, and no personal
   accounts.
2. **Five-card baseline:** start `5`, present/action two cards, interrupt,
   resume, complete exactly five; prove no duplicate grade and no lost member.
3. **Mixed queue:** `5 new + 10 review` and `10 new only`; record queue source,
   `new/review/learning` state, History rows, and footer counters separately.
4. **Controlled time:** morning/evening, 1/3/7-day gaps, day rollover and DST;
   include the `<0.5`-day short-term boundary and the display/due rounding
   layer. These scenarios remain evidence until #279/#248 decisions are made.
5. **Limits and known marks:** 50/100 new with daily limits, known mark and
   undo in new and previously scheduled states, and two meanings/directions.
6. **Failure recovery:** accepted action followed by a failed next-card load;
   restore only loading, keep the accepted action durable, and show the same
   card identity exactly once.

## Non-goals and safety gates

- Do not rename Learn, assign a synthetic grade, or merge learning/review
  policy while proving the current behavior. Product changes belong in a
  separately approved issue after the trace is understood.
- Do not rewrite existing review history or reset the populated local QA DB.
- Do not treat `History`'s page limit as data loss; record `has_more` and query
  the authoritative event count.
- Do not claim anything about human retention or algorithm superiority. The
  output is a software-behavior trace only.

## Exit criteria for the first PR

- one disposable integration test covers the five-card interruption/resume
  baseline through current action and selection boundaries;
- trace output is deterministic and readable in CI artifacts;
- SQL and TypeScript state observations agree where both are applicable;
- full UI/FSRS tests, typecheck, and spec/architecture/standards review pass;
- issue #290 remains open until the temporal, limit, and failure-recovery
  scenarios are separately evidenced.

References: #250, #278, #279, #284, #294, #311,
`docs/research/fsrs-learning/README.md`, and the pinned FSRS baseline.
