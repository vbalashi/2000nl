# Issue #69 — SenseCard Architecture Gate

Issue: https://github.com/vbalashi/2000nl/issues/69
Status: completed
Branch: `codex/issue-69-sensecard-architecture-review`
Base: `d65909f78597e40c883b5df152a2eaba06c7e5d6`
Reviewed feature SHA: `2c0ff4e4de552a340871d711fbb90627c4babb30`
Integrated main SHA: `d16e2b7273e4526eb98430f42f2b8f7f19440129`

## Scope

Documentation and architecture decisions only. No runtime, database, Pen, or
AudioFilms mutation is part of this issue.

## Canonical Artifacts

- decision: [`../../adr/0004-sensecard-presentation-contract-boundary.md`](../../adr/0004-sensecard-presentation-contract-boundary.md)
- implementation plan:
  [`../../architecture/sense-card-platform-v2-contract-plan.md`](../../architecture/sense-card-platform-v2-contract-plan.md)
- frozen review packet:
  [`../../architecture/evidence/sense-card-platform-v2-review/README.md`](../../architecture/evidence/sense-card-platform-v2-review/README.md)
- vocabulary: [`../../../CONTEXT.md`](../../../CONTEXT.md)
- frozen visual spec:
  [`../../architecture/sense-card-visual-spec-v1.md`](../../architecture/sense-card-visual-spec-v1.md)
- real-data audit:
  [`../../architecture/sense-card-real-data-contract-audit.md`](../../architecture/sense-card-real-data-contract-audit.md)
- Platform engineering principles:
  [`../../architecture/post-provenance-review/platform-engineering-principles.md`](../../architecture/post-provenance-review/platform-engineering-principles.md)
- current Platform API:
  [`../../reference/platform-api.md`](../../reference/platform-api.md)
- provenance RPC:
  [`../../reference/platform-provenance-rpc.md`](../../reference/platform-provenance-rpc.md)
- contract-change checklist:
  [`../../reference/platform-contract-change-checklist.md`](../../reference/platform-contract-change-checklist.md)

## Decisions Confirmed By Product Owner

- [x] Platform-owned opaque Headword Group identity.
- [x] Durable Content Node identity across harmless reorder.
- [x] Explicit Platform V2 routes; V1 existing representable states remain
  unchanged, with a fail-closed interoperability guard for active V2 Known
  Marks.
- [x] Known/undo is reversible database state, not an FSRS grade.
- [x] Undo restores preserved card state while immutable history remains.
- [x] User-created/copied/saved entries initially receive independent private
  durable groups; edits and renames preserve them.

## Tracked Follow-Ups

- #70 — publish the Platform V2 DTO and compatibility layer.
- #89 — implement durable Known and undo-known state.
- #76 — first 2000NL single-sense UI tracer.
- #84 — optional Word Details UI.
- #87 — personal definition/translation overrides.
- #51 — structured content/translation feedback.
- #52 — remote interface-language preference and capabilities.

## Platform Contract Checklist Record

- Lookup remains read-only.
- V2 adds typed action/translation routes without renaming V1 action or review
  IDs.
- FSRS behavior is unchanged; #89 adds a separate Known overlay and owns its
  DB migration/RPC tests.
- `source-context-v2`, server-derived principal identity, Connected Client
  scopes, privacy, and atomic action/provenance persistence remain required.
- Public V2 response shapes, route snapshots, shared client fixtures, and
  Platform API reference updates are implementation evidence owned by #70.
- 2000NL and AudioFilms are both affected; the plan defines independent
  adapters, localization, rollout, and rollback gates.
- This #69 change is documentation-only: it performs no runtime mutation, DB
  migration, production deployment, or live-DB validation.

## Review Checkpoints

- [x] current 2000NL contract reconciled against integrated main;
- [x] AudioFilms transition projection inspected read-only;
- [x] documentation grill completed for material product decisions;
- [x] one frozen plan/evidence packet created;
- [x] independent architect review A received;
- [x] independent architect review B received;
- [x] round 1 disagreements compared explicitly;
- [x] round 1 P0/P1 findings incorporated into revision 2;
- [x] revision-2 closure review A received with required changes;
- [x] revision-2 closure review B received with required changes;
- [x] final revision-3 review A passes;
- [x] final revision-3 review B passes;
- [x] every remaining P0/P1 resolved or assigned with an explicit blocking boundary;
- [x] ADR status finalized;
- [x] final repository review passes (Standards and Spec);
- [x] PR #90 integrated and exact reviewed SHA verified as an ancestor of
  `main`;
- [x] this execution plan moved to `completed/`.

## Stop Rules

- Do not start #70 while a material #69 blocker remains.
- Do not modify the dirty/divergent main checkout.
- Do not edit AudioFilms or Pen from this worktree.
- Do not average reviewer opinions; resolve the underlying evidence and
  invariant.
- Do not mark Done before the exact integrated SHA is rechecked on `main`.
