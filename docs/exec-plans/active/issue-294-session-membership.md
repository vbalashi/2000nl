# Issue #294 — server-latched Training membership

Status: design and characterization slice, based on `3f02f9e8`.

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

1. Add the session/membership schema and start/inspect RPCs with database
   characterization tests. No UI behavior changes in this slice.
2. Route the Training selection port through the opaque session id and a
   session-scoped next-card RPC. Preserve the existing #250 accepted-action
   and load-retry state machine.
3. Migrate internal probes and tests to explicit scheduler signatures, add the
   executable no-caller check, then remove compatibility overloads in a
   separate migration.
4. Run spec, architecture, refactoring, and UI QA reviews. Deploy only after
   the five-card mutation/retry scenario proves the denominator and membership
   remain stable.

## Explicit non-goals

- no FSRS formula or learning-step change;
- no rewrite of review history;
- no change to `Learn`, `Good`, `Hard`, or `Easy` semantics;
- no visual redesign beyond displaying the already-latched session state.
