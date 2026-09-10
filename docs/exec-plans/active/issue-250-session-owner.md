# #250 — one owner for Training transitions

GitHub #250 owns status. Renderer retirement #142 is integrated as `21858947`.
The original plan was drafted against `a5ecc88b`; the current implementation
slice is based on `origin/main` at `7a45141b`. #294 owns immutable server-side
session membership. No FSRS or learning-policy changes belong here.

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

## Slice 2: session exclusions and refresh position (2026-09-10)

This implementation slice adds the exclusion-aware session selector and threads
the current/consumed card keys through speculative selection. A prepared candidate
can no longer be the card that is still being answered. A resumed session
restores its first unconsumed member and the visible `position / total`; the
StrictMode mount guard is also covered so refresh hydration is not abandoned.
The selector filters dictionary access before choosing the first member, so a
revoked/private entry does not hide later accessible members. Resume position
counts the complete prefix, including members explicitly marked unavailable.
The attribution fixture now consumes session members only after an accepted
action instead of advancing membership on every read.

This slice does not close #250. It does not yet make scope changes create a
replacement server session, nor does it finish the accepted-action/next-card
outcome contract or remove the remaining root orchestration. Migration 135 is
the additive database contract needed by this slice; overload retirement stays
with #294 after active callers are migrated.

Tradeoff: during this short boundary, reveal/hint/report are disabled along with
grading. The card remains visible. This slice does not add layout or copy.

## Slice 3: explicit scope replacement boundary (2026-09-10)

When a list, scenario, mode, language, or filter changes, the controller now
passes an explicit `trainingSessionId: null` to the immediate replacement load
(including the focus-filter observer); card-filter changes also clear the
active finite-session boundary before the next selection. The selection port
distinguishes that boundary from an omitted override, so a callback captured by
the previous render cannot reuse the old latched session. The explicit session
start and resume paths mark their filter as already owned by their authoritative
load, avoiding a duplicate replacement request after React commits the state.
This is a client-side safety boundary only; the next explicit finite-session
start still creates the new server session. No scheduler, FSRS, or visual
behavior changes belong here.

Characterization covers both meanings of the optional id: omitted requests keep
the active session, while explicit `null` suppresses it during replacement.

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
