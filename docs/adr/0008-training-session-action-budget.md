---
status: accepted
date: 2026-09-11
---

# Training sessions count completed exercises, with soft mixing and no daily cap

The learner selects a total session size N across new material and repetitions.
This is a pacing boundary followed by an explicit offer to start another session,
not a limit on daily learning. This replaces the briefly considered interpretation
of N new meanings plus ratio-derived repetitions. One size means the same thing
in mixed, new-only and review-only modes.

## Accepted behavior

- Learn, Known and each accepted recall grade complete one exercise. Recall in
  another direction is another exercise. Transport retries of the same action
  count once. Reveal, hint, lookup, failed loading and replacement count zero.
- Progress starts at 0/N and reaches N/N on the Nth accepted action. Keep the
  requested size separate from the number of candidates currently available.
- Mixed mode starts with one new exercise, followed by R repetitions for ratio
  1:R (1 through 5), then repeats. At N=10 and R=5 the order is
  new, five repetitions, new, three repetitions. At N=50 it stops at 50 actions.
- Mixing is a preference, not a quota. If one category is empty, use available
  eligible material from the other category permitted by the selected mode.
  New-only and review-only never switch categories.
- If eligible material runs out before N, report exhaustion separately from
  reaching the requested size. Unavailable cards do not consume the budget;
  replacement may use another eligible target within that same budget.
- Again completes an exercise and updates directional FSRS normally. Future-due
  material must not be pulled forward to fill a session or force immediate replay.
- Completing a session offers a new session; starting it requires an explicit
  user action. Any extension likewise requires explicit choice. There is no
  daily new/review blocking. Today statistics describe actual activity, with new
  enrollment counted by unique meaning; Known is not enrollment.
- The owner confirms that preserving old session snapshots is unnecessary on
  this small test platform. Preserve learning state, FSRS and action history.
  This exception does not authorize erasing learner data or disabling reliable
  resume/retry for sessions created under the new contract.

## Architecture and consequences

The server owns the session budget, mixing order and accepted-action accounting.
The UI displays that state. Reuse the existing atomic action receipt/binding
boundary. Share eligibility/access/due rules with the scheduler; a second copy
of the complete scheduler is not an accepted design requirement. The agent may
choose a parameterized shared candidate function or another focused seam after
characterization. Preserve performance and explicitly audit non-session callers.

Follow-through: migration 140 implements that seam under #353. The parameterized
private v2 candidate relation is the one eligibility body. Direct public RPCs
call it with daily limits enabled; finite sessions pass the same relation
`false` for daily limits. The direct public RPC signatures are deliberately
retained until an external caller audit supports a separate deprecation, but
there is no private v1 scheduler implementation or second active scheduler.

The public settings and completion surface need the scoped visual approval in
#331. The numeric contract does not depend on approving future idiom screens.
Exact control layout, the full preset list and an extension control are not
approved here; 10 and 50 are explicit acceptance examples.

This decision governs session sizing in #334 under #327. ADR 0005 describes an
earlier navigation slice; its transient-session limitations must not be used to
undo the subsequently implemented durable session/retry behavior.

References: [#334](https://github.com/vbalashi/2000nl/issues/334),
[#327](https://github.com/vbalashi/2000nl/issues/327),
[#331](https://github.com/vbalashi/2000nl/issues/331).
