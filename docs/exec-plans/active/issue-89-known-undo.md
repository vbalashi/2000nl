# Issue 89 — Durable SenseCard Known / Undo

Status: active

Issue: https://github.com/vbalashi/2000nl/issues/89

Base: `2c47b82f229e4e35024039fc4c2b604a5dec9366`

## Outcome

Add reversible Known state for one exact `(entry_id, card_type_id)` without
changing its preserved FSRS or learning state. Publish only server-derived
Known/Undo capabilities through Platform V2.

## Public seams

1. Database action boundary: mark, retry, conflict, undo, stale undo, and
   training exclusion.
2. Platform V2 boundary: lookup state/capabilities and the V2 action
   request/response contract.

Tests observe these seams rather than private helpers.

## Invariants

- A current Known Mark is separate from `hidden`, `frozen`, and FSRS state.
- Mark and undo append immutable action history.
- Mark does not manufacture a review, grade, interval, or review log.
- Undo clears only the active mark revision and exposes the preserved state.
- Identical retries return the original result; payload conflicts do not write.
- Active Known cards are excluded by shared selectors and reject legacy
  start/review mutations.
- Source-context-v2 provenance and card mutation commit atomically.
- V1 semantics remain unchanged for cards without an active V2 Known Mark.

## Vertical slices

1. [x] Add DB-backed red tests for mark/undo state preservation, retries, stale
   undo, concurrency, and selection/mutation exclusion.
2. [x] Add lock-safe migrations `109`–`113` with the state-revision rollout,
   Known Mark/current-state model, and one atomic V2 action RPC, reusing the
   existing provenance/idempotency transaction.
3. [x] Add V2 projection and route red tests, then expose `knownMark`,
   `mark-known`, and `undo-known` from returned server state.
4. [x] Add V1 rollback and source-aware atomicity coverage.
5. [x] Update public contract/runbook documentation and consumer fixtures.

## Implementation checkpoint

- Migrations `109`–`113` roll out state revisions without a volatile-default
  table rewrite. The backfill fails closed above 100,000 pending rows so a
  larger installation must use an operator-managed batched rollout. Migration
  113 then stores one active Known Mark per exact card and immutable Mark/Undo
  events without changing scheduler fields.
- The shared broad and filtered selectors exclude active marks; their renamed
  pre-Known implementations are no longer executable by API roles.
- `/api/platform/v2/actions` accepts only revision-checked Platform V2 card
  mutations and is independently gated by `PLATFORM_V2_ACTIONS_ENABLED`.
- Lookup emits mutation capabilities only while that endpoint is enabled.
- `source-context-v2` source, artifact, location, action event, and card state
  share one database transaction.
- EN/RU/NL message keys and the shared Known/Undo consumer fixture are pinned.

Validation before review-ready:

- focused Known/Undo database tests: 13/13;
- clean-database FSRS/DB suite: 77/77;
- Platform API/projection suite: 167/167;
- full non-DB UI suite: 382/382 with 72 expected DB skips;
- typecheck and lint: pass;
- production build with explicit non-production Supabase build values: pass;
- fresh bootstrap/probe through migration 113: pass;
- populated bootstrap replay with the legacy V1 card-state RPC intact: pass;
- populated migration-108 upgrade through split migrations 109–113: pass;
- migrations 109–113 exact reapply: pass.

## Validation

- Focused DB/RPC tests after every DB slice.
- Focused V2 projection and route tests after every API slice.
- Typecheck and lint regularly.
- Full UI suite and FSRS/DB suite once at the end.
- Exact-SHA Standards and Spec reviews before review-ready.

## Rollback

Before consumer use, disable V2 Known capabilities and roll forward with a
corrective migration. Never reassign Known Mark IDs or delete accepted action
history. Disabling the surface leaves active marks authoritative and excluded
from training until explicitly undone.
