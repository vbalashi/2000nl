# #250 — one owner for Training transitions

GitHub #250 owns status. Renderer retirement #142 is integrated as `21858947`.
This worktree starts from the same tree at `a5ecc88b`; #294 owns immutable
server-side session membership. No FSRS or learning-policy changes belong here.

## Slice 1: action boundary and stale prepared cards

- While an accepted action is still completing its UI transition, a newly
  mounted card must not send another progress action. The existing root pending
  signal disables the V2 interaction surface until settlement.
- A prepared next card transferred to an accepted transition must still belong
  to the current load generation when its readiness promise resolves. A reset
  or scope replacement invalidates it; the old server acceptance is retained,
  but the old candidate must not overwrite the new session.
- Keep the existing controller; do not introduce a parallel queue or scheduler.

Characterization: delayed acceptance across keyed card remount; real V2 session
and action client with intercepted transport; delayed detached prefetch after
scope cancellation. Test gates release even on assertion failure. The Screen
regression fails without the combined interaction-disabled input.

Tradeoff: during this short boundary, reveal/hint/report are disabled along with
grading. The card remains visible. This slice does not add layout or copy.

## Remaining after slice 1 — do not close #250 yet

1. Remove mutation of reviewed/excluded state from presentation effects. Make
   reset/continue/new-session ownership explicit in the controller; characterize
   delayed startup hydration before changing this behavior. See issue comment
   `5617049802`; a mock failure is not proof of lost server writes.
2. Separate action accepted, next loading, next presented, next failed/cancelled
   in the internal contract. Preserve exact receipt identity and prove that
   retry never repeats an already accepted grade.
3. Move session composition behind the established owner, then remove replaced
   root state/handlers. Preserve Details/History/Settings return and reveal.
4. Complete spec/standards/refactor review, full CI and UI QA before rollout.

The stale-prefetch guard still returns `accepted` for an already accepted action
whose presentation was cancelled; it does not claim a new card was shown. The
explicit outcome contract remains step 2, not a completed part of this slice.

Next program order: #250 → #294 → #279 reference vectors → #290 simulation.
