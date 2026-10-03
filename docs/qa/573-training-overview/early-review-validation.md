# Explicit early review validation

Validated 2026-10-03 in a disposable local database using
`scripts/db-local-supabase.sh test-fsrs`: **335 tests passed, 36 files**, including
16 new early-review contract tests. UI typecheck and focused ESLint also passed.
No production state was read or mutated for these tests.

## Contract

`trainingFilter.reviewTiming = "early"` is an explicit session-only option and
requires `cardFilter = "review"`. It is persisted in the authoritative session
snapshot and request hash, not in a saved recipe. Ordinary review requests do
not widen their pool. Words and current contextual Translation share the
ordinary meaning planner. Idioms preserve separate directional target identity.

Early review selects FSRS-enabled cards with an actual prior answer
(`fsrs_reps > 0` or `last_reviewed_at` present), including learning cards, without
restricting the next-review date. Unanswered enabled states and new cards do not
enter. Material/access, lexical filters, directions, hidden/frozen state, pair
exclusions and source eligibility continue through the existing candidate
functions. Candidates are ordered by next-review timestamp; finite limits apply,
and the existing `all-due-today` wire sentinel means all eligible early reviews
when accompanied by this explicit option. No new arbitrary date horizon exists.

Early cards retain the authoritative learning/review queue source. They are not
legacy practice cards, which bypass review counters. Existing FSRS and action
receipts apply without an algorithm change.

## New SQL contract coverage

- Ordinary review stays empty with only future reviews; early selection is
  nearest due, finite or all, with no new/unanswered/hidden/frozen leakage.
- Start retry returns the same run; changing early timing conflicts with the
  original receipt rather than claiming a different run.
- A foreign authenticated principal cannot start the owner's early run.
- New/both mode combined with early timing is rejected.
- Again/Hard/Good/Easy use ordinary FSRS at both one-hour and one-day elapsed
  time. Stored stability, difficulty, repetitions, interval and next-review date
  agree with `fsrs6_compute`; the actual reference timestamp is recorded.
- Action retry is duplicate and consumes/counts only once.
- An external Library grade replans the early remainder while preserving its
  timing option and remaining budget; it does not consume a session answer.
- A mixed idiom run orders direct/reverse targets globally by due date and
  excludes unanswered exercise states.
- All-mode idiom selection returns **1001 targets**, proving no 1000-page cap.
- Early POS/direction filters, pair exclusions and revoked dictionary access
  remain effective.
- The new helper has no execute grant to anon/authenticated/service_role.

Existing 319 tests remain green, including FSRS parity, context eligibility,
active-run authority, pair exclusions, source scope and publication access.

Migration: `207_repeat_early_training_sessions.sql`.
SHA-256: `8801eccaee6c19943fe009af7231f735e879eb8c3eb4370ac3e5968f3af42552`.

Additional regressions cover answered short-interval learning cards (the normal
review-only scheduler otherwise classifies those as practice), Known cards, and
early contextual Translation freezing an example while updating only the
ordinary reverse card's FSRS state.

Both `read-only-postflight-207.sql` and full `postflight-207.sql` chains passed
against a separate disposable database with all migrations applied. That
database was removed after validation.
