# Issue #70 — Platform V2 SenseCard Contract

Issue: https://github.com/vbalashi/2000nl/issues/70
Status: in progress
Branch: `codex/issue-70-platform-v2-contract`
Base: `9772e516fbf72016fc9321db5abb2d7707e698fb`

## Scope

Implement the accepted Platform V2 presentation contract additively. V1
request/response behavior remains characterized and deployable.

## TDD Seams Confirmed By #69

1. Public TypeScript DTO in `packages/shared/types/platformV2.ts`.
2. Pure V1-row-to-V2 projection in
   `apps/ui/lib/platform/projections/senseCardV2.ts`.
3. Authenticated and catalog `/api/platform/v2/...` route responses.
4. Database identity/read boundary for Headword Groups and Content Nodes.

Tests assert these public seams, not internal helper calls.

## Slices

### 1 — Contract tracer

- [x] add one literal single-sense V2 fixture test;
- [x] publish shared V2 discriminated types;
- [x] project one persisted entry without `raw` or positional translation
  joins;
- [x] prove V1 snapshot remains unchanged.

### 2 — Identity and grouping

- [ ] add durable Headword Group and Content Node storage;
- [ ] backfill source groups and one private group per existing user entry;
- [ ] reconcile Content Nodes only from native or unambiguous evidence;
- [ ] add group/count/privacy/reorder/ambiguity tests.

### 3 — Additive lookup routes

- [ ] require and echo `cardTypeId`;
- [ ] return whole groups with explicit completeness metadata;
- [ ] add authenticated `/api/platform/v2/lookup`;
- [ ] add public `/api/platform/v2/catalog/lookup`;
- [ ] keep Known/undo capabilities absent until #89.

### 4 — Translation, rich content, and compatibility

- [ ] project entry and Content Node translation states with fingerprints;
- [ ] project typed cross-reference and minimum Word Details variants;
- [ ] cover localization keys and exact action targets;
- [ ] update Platform API reference and shared consumer fixtures;
- [ ] validate the V1/V2 rollout and rollback matrix.

## Parallel-Work Guard

The dirty `/Users/khrustal/dev/2000nl` checkout contains stale unpublished
translation work last modified on 2026-06-29, including
`packages/shared/types/platform.ts`, `docs/reference/platform-api.md`,
`db/migrations/bootstrap.sql`, and an untracked migration numbered `103`.

- Do not edit or clean that checkout.
- Put V2 types and projection in new modules.
- Reserve migration `103`; use the next collision-safe number.
- Keep bootstrap/API documentation changes minimal and easy to reconcile.
- Recheck the dirty checkout before every checkpoint that touches an
  overlapping path.

## Validation

- focused projection tests on every red/green slice;
- V1 route characterization tests;
- V2 route tests;
- UI typecheck and lint;
- relevant local DB/RPC tests for schema/read-boundary changes;
- full UI suite once before review-ready;
- independent Standards and Spec reviews on the exact pushed SHA.

## Stop Rules

- Do not expose synthetic or position-derived public identity.
- Do not let lookup write or lazily create identity.
- Do not expose V2 Known/undo before #89.
- Do not modify AudioFilms, Pen, or the dirty main checkout.
- Do not mark Done before exact integrated-main verification.
