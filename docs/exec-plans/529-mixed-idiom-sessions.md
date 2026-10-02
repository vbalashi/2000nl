# Mixed idiom sessions

Implements #529 under the approved #533 plan. Owner selected both Direct and
Reverse as real independently scheduled idiom targets, not mutually exclusive
checkboxes.

## Contract

- Existing direct/reverse session starts retain their scalar RPC contract.
  The scoped start RPC additionally accepts `direction: mixed`.
- A mixed run stores `idiom:direct` and `idiom:reverse` in its canonical selection.
  The snapshot reports `mixed`; each member and review request remains strictly
  `direct` or `reverse` with its existing target ID and independent FSRS state.
- The requested size counts exercises, not pairs: 10 means at most 10 accepted
  directional targets. Bounded pools are interleaved direct/reverse before the
  existing new/review rhythm. This is no quota: eligible targets from either
  direction fill shortages. A size of 1 cannot contain both directions.
- Scope, source/material filters, pair exclusions, due eligibility, retry identity,
  active-run ownership, completion and unavailable behavior remain authoritative.
- Session statistics count both directional schedules without creating targets.
  UI chrome describes the current target direction, rather than labeling the
  entire mixed session reverse.

## Rollout integration

Migration 198 patches the latest definitions, retaining the material-snapshot
change from 184 and exclusions from 169. It needs coordinated manifest integration
after 196 and 197: this isolated branch intentionally does not enable a manifest
with missing predecessors. Append its exact SHA-256 and use postflight-198 plus
read-only-postflight-198 in the integrated deployment commit. No production writes
are part of this branch.

## Validation

Focused real-DB tests cover both target identities, saved selection, start retry,
resume after each grade, duplicate grade, independent state counts, completion and
both-direction statistics. Existing direct/reverse contract coverage remains.
Builder saved-recipe roundtrip, start controller, client contract and card tests
cover propagation through the UI. Exact commands/results are recorded in the PR.
