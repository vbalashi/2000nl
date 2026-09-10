# #250 — one owner for Training transitions

GitHub #250 owns status. Renderer retirement #142 is integrated as
`21858947e1a5d11ab550a34e0b7717013527e2b5`. This plan was re-audited against
`origin/main` at `296cbcadf79889036f27a0e74d814d7466a088bf` on 2026-09-11.

The plan below is a status document, not a second implementation design. It
records the shipped slices and the final evidence for the parent issue.
#294/#311 own server-latched membership and unavailable members; no FSRS or
Learn-policy changes belong here.

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

## Final #250 acceptance audit (2026-09-11)

The remaining work was checked against the merged mainline rather than the
older feature worktrees. The audit found no second transition owner and no
unresolved root cleanup in the accepted scope.

### Real V2 preservation proof

Using the local Supabase DB136 pilot profile and a fresh QA identity, the real
browser path was exercised on 2026-09-11:

1. Continue an active session and receive a Face card (`vers`, position 1/10).
2. Show Answer; the same card remains mounted with the Answer side and the
   one-line progress footer.
3. Open and close Word details; the card and Answer side return unchanged.
4. Open History and return to Training; the same card and side return.
5. Open Settings and return to Training; the same card and side return.

Network inspection showed the expected session selection requests only; no
additional selection was issued by Details/History/Settings navigation. The
local health gate was `status: ok`, database target `local`, and contract
`2000nl-db-136`.

### Root and compatibility inventory

- `TrainingScreen` has one active transition owner: `useTrainingTurnController`.
- `TrainingSessionSurface` owns the session shell/footer/notice rendering; the
  root passes typed inputs and callbacks rather than React fragments.
- PR #315 removed the dead `FooterStats` mode inputs and their root handler.
  The remaining `FooterStatsProps` fields have active consumers (progress,
  list/language/filter controls, session labels, or settings navigation) and
  are not safe deletion candidates without a new product decision.
- `node scripts/check-training-retirements.mjs --final-training` passes on the
  current mainline; no retired Training renderer/controller path is active.

### Final gates

- Local DB contract check: passed (`2000nl-db-136`).
- Typecheck, lint (one pre-existing hook-dependency warning), focused UI tests,
  full UI/E2E CI, and the #317 database/FSRS checks: passed.
- Live deployment health after #317: `2000.dilum.io/api/health` returned
  `status: ok` for merge `296cbcadf…`, version `0.18.586`, contract DB136.

All acceptance boxes below are now evidenced. Keep #250 open only until the
owner records the final review/closure comment; no further runtime slice is
planned under this issue.

## Historical remaining-work checklist (now evidenced)

1. **Real-path preservation proof — complete.** The browser smoke above covers
   Face → Answer, Details/History/Settings → return, and confirms the same card
   and Answer side without an extra selection or grade.
2. **Root cleanup — complete for the proven stale fields.** PR #315 removed
   `FooterStats.enabledModes`, `FooterStats.onModesChange`, and the unused root
   handler. Remaining props are live and intentionally retained.
3. **Final gates — complete.** The shipped #250 slices passed their product,
   architecture, and refactoring reviews; this audit found no new blocker.
   CI and local/live QA passed on the exact merged mainline. The owner can now
   close #250.

The accepted-action outcome contract and load-only recovery are already shipped
by #304. A cancelled presentation after an accepted action still reports an
unavailable next card; it never authorizes resubmitting the grade.

Next program order after the closure comment is #279 FSRS reference vectors →
#290 workload simulation. #294/#311 server membership and unavailable-member
outcomes, #278 observability, and #248 finite-session sizing are closed; #249
gallery/design work is separate. Draft #144 and blind review #143 remain
untouched.
