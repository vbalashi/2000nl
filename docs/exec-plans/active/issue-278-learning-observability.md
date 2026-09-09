# Issue #278 — Make new learning and Learn history observable

Status: implementation slice in progress

Issue: https://github.com/vbalashi/2000nl/issues/278

Related FSRS parity follow-up: https://github.com/vbalashi/2000nl/issues/279

## Product decision from the FSRS-6 research

`Learn` means that the learner accepted this card into the learning queue. It
is an enrollment event, not a remembered or forgotten answer and therefore not a
faithful FSRS rating. The first actual Again/Hard/Good/Easy answer is the first
FSRS review. This preserves both the learner's intent and the scheduler's
meaning; it avoids inventing a failed recall just to move a counter.

The report is pinned to Anki 25.07.5 and fsrs-rs 4.1.1. It also says that
fixed learning steps and FSRS memory state can coexist, but choosing that
scheduling policy is a separate decision. This slice does not change intervals,
queue selection, or FSRS formulas.

## Observable facts

The read model must keep these facts separate:

| Fact | Source | Meaning |
| --- | --- | --- |
| Introduced today | accepted `start-learning` event, with first `new` review fallback | card/meaning entered the learner's queue |
| Learning started today | accepted `start-learning` event | explicit user action, useful for diagnostics |
| First graded review | `user_review_log` with `review_type = 'new'` | first FSRS grade, not enrollment |
| Graduated new word | new review whose current/new interval reaches an interday threshold | a separate progress metric, not the New counter |
| Review activity | `user_review_log` with `review_type = 'review'` | ordinary FSRS repetition |

Identity is always `entry_id + card_type_id`. Known marks remain a reversible
overlay and do not erase any of these historical facts.

## Safe sequence

1. Add characterization tests for accepted Learn, duplicate retry, first grade,
   direct review, mixed new/review activity, and multiple card directions.
2. Publish `learning_started` in the existing 24-hour History projection while
   preserving the existing review labels.
3. Make `newWordsToday` and `newCardsToday` count introduced cards rather than
   inferring a past event from mutable current interval state. Add explicit
   `learningStartedToday` and `graduatedNewWordsToday` fields.
4. Verify a controlled 5-new and mixed 1-new/1-review run against the footer,
   History, card state, and review-log rows.
5. Compare local and online function signatures/contracts before rollout. No
   data rewrite is required.
6. Only after this slice is trusted, implement the independent #279 reference
   vectors and decide whether any SQL/TypeScript FSRS deviation is intentional.

## Explicitly deferred

- Learn-as-Again semantics.
- Fixed Learning Steps versus FSRS short-term scheduling.
- New→Again lapse classification changes.
- Any migration or synthetic backfill of old review history.
- UI redesign, queue policy, and work on #143/#144.
