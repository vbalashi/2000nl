# Training history-filter follow-up

Status: deferred product/implementation ticket candidate, recorded during the
VanDale validation pass on 2026-09-20.

The current training history condition is intentionally broad: if any action
event exists for the exact user, entry/card target, source (when selected), and
time window, the entry is considered encountered/viewed. This is the behavior
to use for the current VanDale session work.

Follow-up scope:

- add an explicit grade filter, with `Any answer` = `review-card` plus one of
  `fail|hard|success|easy` and `Again/forgotten` = `review-card` plus `fail`;
- keep lookup, reveal, `start-learning`, Known, and other event rows out of
  those grade-specific predicates;
- replace calendar-day `daysAgo` behavior with an elapsed-hour window, so
  seven days means 168 hours anchored at session start;
- add boundary tests for exact lower/upper timestamps, future events, and
  same-entry events from a different source or card direction.

This ticket must not change the broad “any recorded event means encountered”
behavior unless that product decision is made separately.
