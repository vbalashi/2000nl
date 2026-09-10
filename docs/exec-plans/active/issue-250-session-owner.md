# #250 — one owner for Training transitions

GitHub #250 owns status. Renderer retirement #142 is integrated as
`21858947e1a5d11ab550a34e0b7717013527e2b5`. This plan was re-audited against
`origin/main` at `f5bd6c781d4d20c3c846575d9ccafad87b630359` on 2026-09-10.

The plan below is a status document, not a second implementation design. It
lists work that is already shipped separately from the small amount that still
needs proof or cleanup. #294/#311 own server-latched membership and unavailable
members; no FSRS or Learn-policy changes belong here.

## Shipped slices (do not reimplement)

| Change | Delivered by | What is now true |
| --- | --- | --- |
| Accepted action boundary and stale prefetch protection | #302 | A pending accepted action blocks duplicate input; a stale prepared card cannot replace the current card. |
| Explicit reset ownership | #303 | Queue/session resets happen at explicit Training boundaries; the presentation hook is render-only. |
| Accepted action vs next-card outcome | #304 | The client distinguishes `accepted-next-presented`, `accepted-session-complete`, and `accepted-next-unavailable`; recovery retries only the read. |
| Session surface composition | #305 | `TrainingSessionSurface` owns chrome/footer/notices; the root passes typed inputs and intents. Details/History/Settings navigation is preserved by characterization tests. |
| Immutable session plumbing | #306–#310, #312–#313 | The server-latched session id is carried through start → selection → action, resume restores the position, unusable candidates are excluded, and scope changes explicitly clear the previous session id. |

The previous “remaining” list incorrectly repeated #303–#305. Those items are
closed and must not be reopened as new work.

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

This slice did not close #250. Scope replacement is now covered by #313, while
the server-side membership and overload retirement remain with #294/#311.
Migration 135 is the current additive database contract.

Tradeoff: during this short boundary, reveal/hint/report are disabled along with
grading. The card remains visible. This slice does not add layout or copy.

## Slice 3: explicit scope replacement boundary (2026-09-10)

When a list, scenario, mode, language, or filter changes, the controller now
passes an explicit `trainingSessionId: null` to the immediate replacement load
(including the focus-filter observer); card-filter changes also clear the
active finite-session boundary before issuing their immediate replacement
selection. The selection port
distinguishes that boundary from an omitted override, so a callback captured by
the previous render cannot reuse the old latched session. The explicit session
start and resume paths mark their filter as already owned by their authoritative
load, avoiding a duplicate replacement request after React commits the state.
This is a client-side safety boundary only; the next explicit finite-session
start still creates the new server session. No scheduler, FSRS, or visual
behavior changes belong here.

Characterization covers both meanings of the optional id: omitted requests keep
the active session, while explicit `null` suppresses it during replacement.

## Remaining #250 acceptance work — do not close yet

1. **Real-path preservation proof.** Extend characterization around the real V2
   session (not only the screen mock) for Face → Answer, Details/History/Settings
   → return, refresh/resume, and a late response from an old card/session. The
   proof must show the same presentation identity/side is restored and no second
   selection or grade is issued.
2. **Root cleanup, only where proven stale.** Inventory the current
   `TrainingScreen`/`FooterStats` inputs and remove superseded optional fields or
   handlers only after their active callers and tests are identified. Do not
   replace the existing controller or move state merely to make the file
   shorter; the owner boundary is behavioral, not a line-count target.
3. **Final gates.** Run product/spec review, architecture review, refactoring
   review, full CI, and local/live UI QA against the exact merged SHA. Close
   #250 only when all acceptance boxes are evidenced.

The accepted-action outcome contract and load-only recovery are already shipped
by #304. A cancelled presentation after an accepted action still reports an
unavailable next card; it never authorizes resubmitting the grade.

Next program order remains: finish the narrow #250 proof/cleanup → #294/#311
server membership and unavailable-member outcome → #279 FSRS reference vectors
→ #290 simulation. #278 observability and #248 finite-session sizing are closed;
#249 gallery/design work is separate. Draft #144 and blind review #143 remain
untouched.
