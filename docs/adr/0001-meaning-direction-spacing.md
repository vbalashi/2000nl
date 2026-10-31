# ADR-0001: Separate opposite meaning directions within the training queue

- Status: Accepted
- Date: 2026-10-31
- Decision owner: product owner, agreed in the training-spacing discussion
- Tracking: [issue #32](https://github.com/vbalashi/2000nl/issues/32)
- Implementation: prepared in commit `ba9e886`; managed rollout pending

## Context

When both word-to-definition and definition-to-word are selected, the two
cards for one meaning can appear consecutively or with only one intervening
card. Revealing the first card exposes the answer needed by the other direction,
making the second recall judgment less informative and the exercise repetitive.

Both directions remain useful and retain independent learning state. We need
separation without dropping a direction or introducing a forced next-day
eligibility rule. A session can be short, so rearranging only its already selected
members cannot always provide the desired separation at the session boundary.

## Decision

1. During ordinary meaning-session planning, keep at least three intervening
   cards between the two directions of the same meaning whenever an eligible
   candidate outside the last three selected meanings is available.
2. Group siblings by meaning identity (`entry_id`), not headword. Different
   meanings with the same spelling remain independent.
3. Choose from the eligible pool before applying the requested session size.
   Defer a conflicting sibling and use the next suitable candidate, including
   one beyond the original session boundary. Keep the requested size when
   enough eligible cards exist.
4. A deferred sibling may return later in the same session once the gap is met.
   If displaced beyond the session boundary, leave it eligible for subsequent
   training with no fabricated grade, due-time change or day-based deferral.
   Inclusion in the very next session is not guaranteed.
5. Preserve the normal new/review rhythm when possible. A non-conflicting card
   from the other category takes precedence over that rhythm when necessary
   to maintain separation.
6. If every remaining candidate conflicts, relax the gap and choose the least
   recently selected meaning. Do not shorten the session merely to enforce
   spacing, or wait indefinitely for more material.
7. Persist the selected order for resume. When rebuilding the remainder after
   an external learning action, include the last three consumed members as
   recent history across the consumed/replanned boundary.
8. This is a queue-ordering policy, not a change to directional FSRS state,
   grading semantics or same-direction relearning. Idiom and translation
   exercise queues are outside this decision's scope.

## Alternatives considered

- **Force the sibling into the next study day:** rejected by the product owner.
  It adds a separate eligibility mechanism and raises the risk of repeatedly
  displacing one direction.
- **Exclude the sibling only for the current session:** insufficient, since
  starting another short session can immediately expose it again; it also
  prevents useful, adequately separated practice within a longer session.
- **Only shuffle the selected session:** cannot reliably resolve a sibling pair
  at the end of a short session without looking at additional candidates.
- **Only prevent consecutive siblings:** does not address the reported problem
  of siblings appearing with one intervening card.

## Evidence and tradeoffs

Spacing research supports separating retrieval attempts, including within a
session. It does not establish three intervening cards as a universal optimum,
or prove that next-day sibling deferral is superior to sufficient within-session
spacing. Three cards is the agreed initial product policy.

- [Karpicke and Roediger (2007)](https://learninglab.psych.purdue.edu/downloads/2007/2007_Karpicke_Roediger_JEPLMC.pdf):
  delaying initial retrieval improved delayed retention in word-definition
  learning; this did not directly compare opposite-direction siblings.
- [Nakata (2015)](https://doi.org/10.1017/S0272263114000825):
  the amount of spacing affected second-language vocabulary learning.
- [Webb (2009)](https://doi.org/10.1177/0033688209343854):
  receptive and productive practice produced different learning gains,
  supporting continued direction-specific assessment.

This is best-effort separation within a planned session, not a globally optimal
permutation or a cross-session cooldown. Scarce material can produce smaller
gaps. The policy may change which eligible cards fit into a finite session and,
when needed, its new/review mix. Unselected cards retain their learning state.

## Implementation and validation

- [Queue policy and replanning](../../db/migrations/288_meaning_sibling_spacing.sql)
- [Database tests](../../apps/ui/tests/fsrs/trainingSiblingSpacing.test.ts)
- [Architecture overview](../architecture.md#meaning-card-spacing)

Validation for the prepared implementation: 729 database tests passed, two
standard skips; typecheck and lint passed. The new cases also passed against a
fresh disposable database. Coverage includes near siblings, the exact gap,
session-tail replacement, scarce material, category mixing, resume, unchanged
learning state and replanning across a consumed prefix.

The public migration and bootstrap describe application installation. Managed
service deployment requires its separate private forward-migration and release
process; acceptance of this ADR does not mean the behavior is live.
