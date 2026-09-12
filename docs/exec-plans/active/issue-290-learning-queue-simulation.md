# Issue #290 — simulate real learning queue behavior

Status: execution plan, 2026-09-12. The first three bounded DB-contract slices
are implemented as characterization tests; they do not change queue, FSRS, or
user-history behavior.

## Why this is the next slice

The queue/session ownership work is now merged (#250, #294, and #311), and the
local database can be reused safely (#284). The first FSRS reference evidence
slice is merged in #279, but its remaining formula and scheduler-boundary
decisions are intentionally still open. The next useful proof is therefore
not another UI tweak: it is an executable trace of what a learner's cards do
across actions and days.

## What the simulation must prove

The harness must call the current application boundaries, not a second copy of
the scheduler. The first slice deliberately stops at the database RPC boundary
so it can prove durable state before adding an HTTP/browser harness:

- start a finite training session and read its latched membership;
- obtain the next member through the authoritative selector;
- invoke the V2 database action contract with the same validated fields and a
  stable idempotency/event id (the HTTP envelope is a later boundary);
- read the durable action receipt, card state, history, statistics, and next
  presentation;
- assert exact `(entry_id, card_type_id, session_id, ordinal)` identity at each
  step and explain every exclusion or delay. The first normalized trace uses
  deterministic keys; the test separately asserts the real IDs at every RPC
  boundary.

The complete target trace will contain: presented card, user action, accepted
receipt, durable event, history/counter changes, computed due time, next
presentation, and an exclusion/delay reason. The first slice records a
deterministic normalized trace with card ordinal/identity, action, accepted vs
duplicate receipt, event key, and remaining members. It also asserts the
durable event/receipt/history/statistics totals. A failed next-card lookup must
be recoverable without sending a second grade; that failure path is a later
slice.

## Dependency and clock boundary

The current diagnostic SQL is useful characterization but runs in one
transaction with wall-clock `now()`, uses direct SQL actions, and does not prove
the V2 envelope or passage of a scheduler day. Before temporal scenarios are
added, inventory every scheduler use of `now()`, `current_date`, and random
ordering. Introduce one reviewed test-time clock seam shared by the real SQL
boundaries; do not set the host clock, mutate the populated QA database, or
write a simplified scheduler just for tests. TypeScript and SQL observations
must continue to be compared against the same inputs.

### Clock audit — 2026-09-12

The active contract has four distinct time concerns. They must not be collapsed
into one ambiguous "current time" value:

| Concern | Current source | Risk to temporal evidence | Required seam |
| --- | --- | --- | --- |
| FSRS elapsed/same-day math | `fsrs6_compute` reads SQL `now()` and compares `timestamptz::date` in the database session timezone; `fsrsMath.ts` receives only numeric elapsed days | A fixed UTC instant can cross a local scheduler day differently from the database session, while SQL and TypeScript are not driven by the same timestamp | Pass one explicit reference instant and scheduler timezone through the lower-level computation boundary; keep the public wrapper's production default as the real clock |
| Due/frozen candidate eligibility | `training_scheduler_candidates_v2` uses `now()` for `next_review_at` and `frozen_until` | Tests cannot prove just-before/at/just-after due transitions deterministically | Inject the same reference instant into the candidate boundary used by the real selector |
| Session lifetime and terminal timestamps | session start/read and member consumption use `now()` for expiry and completion/exhaustion writes | A temporal test can accidentally depend on wall-clock timing and cannot model a day gap without sleeps | Keep lifecycle timestamps on one captured instant per request; expose a test-only injection at the server-owned boundary, never a host clock change |
| Calendar-day counters and filters | legacy/current candidate paths still use `current_date` for daily review/new counters; `training_filter_local_date` explicitly converts with the requested timezone | The v2 action-budget path does not enforce the daily cap, but counters and legacy callers can still disagree with the learner's timezone | Treat daily counters as a separate policy decision; reuse the explicit named-timezone helper and do not silently reinterpret historical counters |

Migration 148 adds `private.training_reference_now_v1()`. It uses a
transaction-local `training.test_reference_now` override only in disposable
tests and falls back to `statement_timestamp()` for normal requests. The
public RPC signatures remain unchanged. The first temporal slice proves the
seam itself, FSRS same-day classification, and a just-before/at due boundary
through the real selector.

Migration 149 extends that same seam through session creation/expiry, accepted
action timestamps, consumed/completed member state, and action history/receipt
timestamps. The current action boundary remains the production path; no
second scheduler or public clock parameter was added. The lifecycle slice
proves one instant across independent committed requests and exact session
expiry. The full morning/evening, DST, and multi-day corpus remains evidence to
be collected after this seam.

`random()` is a separate reproducibility concern, not a clock. Temporal tests
must either use a deterministic ordering input or assert membership and
identity without depending on a random presentation order. The next
implementation slice should therefore introduce the smallest shared clock
seam for the real SQL boundaries, then add one boundary test through the
existing action/selection contract before attempting the full morning/evening,
DST, and 0.5-day corpus.

## Bounded implementation order

1. **Trace fixture and identity:** disposable local database, one card
   direction, one test learner, and no personal accounts. The characterization
   test uses separate committed transactions to model independent requests.
2. **Five-card baseline (implemented):** start `5`, present/action the first
   card, interrupt, resume, complete exactly five; prove no duplicate action,
   no lost member, and durable action/receipt/history/statistics counts.
   This is a DB-contract characterization, not yet an HTTP route or browser
   end-to-end test.
3. **Mixed queue (implemented slice):** `5 new + 10 review` through the real
   V2 action boundary, with soft `1:5` ordering, exact member identity,
   separate Learn/review receipts and history, and independent footer counters.
4. **New-only budget (implemented slice):** a `10`-card new-only session with
   a deliberately smaller daily new setting, proving that the finite session
   budget is not truncated by the daily setting and that all ten Learn actions
   have independent receipts, history, and new-card statistics.
5. **Controlled time:** migration 149 now covers the accepted-action and
   session-lifecycle clock boundary. Add morning/evening, 1/3/7-day gaps, day
   rollover and DST;
   include the `<0.5`-day short-term boundary and the display/due rounding
   layer. These scenarios remain evidence until #279/#248 decisions are made.
6. **Limits and known marks:** 50/100 new with daily limits, known mark and
   undo in new and previously scheduled states, and two meanings/directions.
7. **Failure recovery:** accepted action followed by a failed next-card load;
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
- its normalized trace is deterministic and readable in test output; a
  structured JSONL artifact remains a follow-up once the HTTP/browser harness
  exists;
- the test explicitly records that five Learn actions create learning-start
  events and receipts, not FSRS review rows;
- SQL and TypeScript state observations agree where both are applicable;
- full UI/FSRS tests, typecheck, and spec/architecture/standards review pass;
- issue #290 remains open until the temporal, limit, and failure-recovery
  scenarios are separately evidenced.

References: #250, #278, #279, #284, #294, #311,
`docs/research/fsrs-learning/README.md`, and the pinned FSRS baseline.
