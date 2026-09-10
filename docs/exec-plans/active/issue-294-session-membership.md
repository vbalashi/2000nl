# Issue #294 — server-latched Training membership

Status re-audited 2026-09-11 against the #294 final-gates worktree. The UI
wiring, refresh/resume path, and unavailable-member outcome are shipped through
PR #317 (DB136). This slice adds the five-card mutation/retry proof, migrates
all remaining repository callers to the explicit scheduler contract, and
retires the compatibility overloads in migration 137. Final review, CI, and
deployment remain the completion gates for #294.

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
revisions and do not call these scheduler RPCs. The remaining repository
references were internal SQL fixtures, diagnostics, and deployment probes;
they are now migrated and guarded by
`db/scripts/scheduler_legacy_callers.test.mjs`. Migration 137 removes the old
eight/nine-argument and `_without_known` entry points from the live database.

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
4. **Shipped via PR #317 — unavailable members.** The read-only
   selector returns a permanent access/content diagnostic; the explicit
   `mark_training_session_member_unavailable` action records
   `unavailable_at`/reason, continues to the next member, and completes the
   session when no available members remain. Transient failures stay retryable,
   and unavailable members never count as learned or accepted reviews.
5. **Implemented in this final-gates slice — caller retirement and evidence.**
   Internal probes, diagnostics, benchmarks, and test fixtures now use explicit
   signatures. The executable no-caller check is wired into the database drift
   workflow. Migration 137 removes the compatibility overloads only after that
   repository gate, and the training RPC suite proves a five-card session keeps
   its original membership through queue mutation, retry, duplicate action, and
   completion.
6. **Final gates.** Run spec, architecture, refactoring and UI-QA reviews;
   apply migration 137 to the populated test database; run the postflight and
   pre-switch probes; then deploy and verify the live health/UI path. Close
   #294 only when all of those checks are green.

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
