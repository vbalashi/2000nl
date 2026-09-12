# 0009 — Sequential introduction of source-bound ordinary meanings

Status: Accepted

Date: 2026-09-12

Owner: 2000NL

## Context

One dictionary headword can contain several ordinary meanings and idiom-only
meanings. Introducing every direction of every meaning as a new card produces
an incoherent first encounter: a learner can be asked to recall an unseen word
from its definition, or be shown a later sense without a usable example.

The product model distinguishes a word's meanings from directional exercises:
the two directions have independent FSRS state, while a deliberate Learn or
Known decision on an ordinary meaning is the enrolment signal for the next
ordinary meaning. Idioms and sentence translation are separate exercise
families and are not introduced by this policy.

## Decision

- For entries with an active source binding, `source_group_key` and
  `sense_ordinal` define one ordered headword group. Only active root
  `definition` nodes are ordinary meanings; idiom-only entries are skipped by
  automatic introduction.
- New ordinary meanings are introduced only as `word-to-definition` exercises.
  `definition-to-word` is a recall/review direction and never introduces a new
  meaning.
- The first renderable ordinary meaning is eligible immediately. A later
  renderable ordinary meaning becomes eligible at the next local midnight after
  Learn or Known is accepted for its preceding eligible ordinary meaning.
- A later direct meaning without its own active root example remains excluded
  by the renderability policy. It does not block the following renderable
  ordinary meaning. Manual meaning selection remains an explicit product path.
- Every session sends the browser-resolved IANA timezone, even when no focus
  filter is active. The database stores that timezone per learner at session
  creation and writes an immutable `available_at` timestamp when Learn/Known
  is accepted. Existing timestamps are never shifted if the browser timezone
  later changes. Invalid or unavailable legacy timezone data falls back to
  `UTC`.
- Existing enrolled, reviewed, or Known meanings are backfilled as immediately
  unlocked predecessors. This migration does not reset FSRS state, history, or
  any learner's already-enrolled later meanings.

## Consequences

This is an introduction policy, not a daily quota. Session size and the soft
new:review ratio continue to determine the finite exercise mix. The canonical
candidate relation remains the sole eligibility implementation for both plans
and session membership, avoiding a plan that promises cards the selector later
rejects.

The policy intentionally does not decide when to visually invite a learner to
choose further meanings, nor does it add idiom or translation exercises. Those
are separate issues (#331, #332, and #333).

## Verification

Integration coverage proves headword-first introduction, reverse-only
exclusion, Learn and Known unlocking, idiom-only gaps, sparse-direct skipping,
legacy enrolled meanings, and both Amsterdam DST transitions.
