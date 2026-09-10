# Issue #294 — server-latched Training membership

Status re-audited 2026-09-10 against `origin/main` at
`1018c7bd3f55e76c2df3c31bbd63ffd863ac9ba8` (DB135). The old status line was
stale: the UI wiring and refresh/resume path are already shipped. The remaining
work is the explicit unavailable-member outcome in #311, five-card evidence,
and safe retirement of internal scheduler overload callers.

## Problem

The finite-session RPC in migration 132 fixes a number (`5`, `10`, or
`all-due-today`), but it does not yet fix the actual card targets. Every later
`get_next_card` call runs the scheduler again. Queue changes, random ordering,
or a renderable-candidate failure can therefore change which targets appear
without changing the displayed denominator.

The two quantities must stay separate:

- **membership** — the server-owned set of unique `entry_id + card_type_id`
  targets selected when the session starts;
- **progress** — how many of those targets have received an accepted learning
  action. A failed render or retry must not advance progress.

## Contract to implement

1. Starting a session creates an opaque server session id and a membership
   snapshot for the exact user, modes, list scope, card filter, source filter,
   and selected session size.
2. Each membership row has a stable ordinal, entry id, card mode, and initial
   queue source. The snapshot is immutable; scheduling mutations do not add
   new rows.
3. Selecting the next target is restricted to that snapshot. A target is
   consumed only after the authoritative card action is accepted, not when a
   DTO is fetched or a card fails to render.
4. Retries use the same current target and remaining membership. A vanished or
   non-renderable target is marked unavailable without pretending it was
   learned; the session can report fewer available targets with an explicit
   reason.
5. Scope/filter changes and an explicit restart create a new session id.
   Details, History, Settings, and a refresh preserve the existing id while the
   session remains active.
6. The UI must display the latched planned total. New/review is informational
   metadata from the snapshot, never a second denominator.

## Current callers and deletion gate

The current UI already uses migration-132 explicit RPC signatures. Direct
lookups in AudioFilms and Pontix were checked at their fetched `origin/main`
revisions and do not call these scheduler RPCs. Remaining old signatures are
internal SQL fixtures, diagnostics, and deployment probes; they must be
migrated and covered by a no-caller check before a forward migration drops the
compatibility overloads.

## Ordered implementation slices

1. **Shipped — schema and membership snapshot.** #306 added migration 133,
   `training_sessions`, `training_session_members`, and start/inspect RPCs.
2. **Shipped — scoped selection and consume.** #307 added migration 134: the
   selector returns the first unconsumed member, and the action wrapper consumes
   it atomically and idempotently.
3. **Shipped — UI and recovery wiring.** #308–#310, #312 and #313 carry the
   opaque id through start → selection → action, persist/resume it after
   refresh, exclude the current/consumed card keys, and explicitly clear it on
   scope replacement. Migration 135 is the current additive exclusion guard.
4. **Next — unavailable members (#311).** Mark a permanent access/content
   failure as `unavailable_at` with a reason, continue to the next available
   member, and leave transient failures retryable. Do not count unavailable
   members as learned or accepted reviews.
5. **Then — caller retirement.** Migrate internal probes, diagnostics and test
   fixtures to explicit signatures; run an executable no-caller check; remove
   compatibility overloads in a separate forward migration only after the gate
   is green.
6. **Final gates.** Run spec, architecture, refactoring and UI-QA reviews.
   Deploy only after the five-card mutation/retry scenario proves that the
   original denominator and membership remain stable.

## Explicit non-goals

- no FSRS formula or learning-step change;
- no rewrite of review history;
- no change to `Learn`, `Good`, `Hard`, or `Easy` semantics;
- no visual redesign beyond displaying the already-latched session state.

## Dependency boundary

#250 owns the client transition owner and load-only recovery. Its accepted
action must remain separate from this issue's membership consume operation.
#311 is the next implementation slice for this issue; it must not introduce a
second Training controller or alter Learn/Again semantics. #279 and #290 wait
until the membership/error outcome is proven.
