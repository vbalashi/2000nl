# Post-provenance architecture review

Date: 2026-06-23
Scope: `2000nl` and `audiofilms`. Pontix is explicitly deferred.

## Executive summary

The source/provenance-aware learning-action work is structurally correct and should not be undone. The important boundaries are in place:

- lookup remains read-only;
- state changes go through explicit Platform actions;
- 2000NL owns action IDs, FSRS/card state, source normalization, privacy rules, and persistence;
- AudioFilms observes YouTube context and submits explicit actions, but does not own learning state;
- source/action history is separated from mutable current card state;
- YouTube source, artifact, location, selection, and observation are separate concepts.

The remaining problems are mostly maintainability risks rather than immediate product blockers. The main follow-up is to reduce future-agent drift by documenting principles and decomposing large modules only after tests protect behavior.

## What was checked

I reviewed the current GitHub state after the issues were closed:

- `2000nl` issues #3, #4, #5, #6 and their closure comments;
- `audiofilms` issue #1 and its closure comment;
- Platform auth/principal code;
- source-context v2 normalizer and DB migrations;
- learning activity/card read APIs;
- AudioFilms YouTube extension source binding and provenance construction;
- root `AGENTS.md` and `ARCHITECTURE.md` guidance;
- relevant test/workflow surfaces.

I did not reopen or modify Pontix. Pontix should remain deferred.

## Current state assessment

### 2000NL

The current Platform shape is acceptable:

- `getAuthenticatedSupabase()` now resolves a `PlatformPrincipal` with `first_party` or `connected_client` identity.
- Platform routes use `requirePlatformScope()` for read/write scope enforcement.
- Source-context v2 is normalized in the HTTP boundary before the DB RPC is called.
- DB migrations add source artifacts, semantic idempotency, review exactly-once checks, canonicalization, and private-source defenses.
- Learning read APIs exist for activity and card filtering.

The design is good enough to build on, but the implementation is now too concentrated in a few broad files.

### AudioFilms

The YouTube extension now freezes a dictionary source binding at click/lookup time and emits `source-context-v2` for actions. It preserves backend practice artifact revisions when available and classifies extension fallback artifacts separately.

The architectural direction is right. The remaining risk is that `extensions/youtube-shadowing/src/content.js` is doing too many things at once: rendering, playback, source binding, dictionary lookup, actions, diagnostics, layout, and preference state.

## Findings

### P1 — 2000NL Platform code is too broad

`apps/ui/lib/platform/platformApi.ts` now mixes lookup, translation, card actions, provenance normalization, user-list logic, user-dictionary logic, and formatting/projection helpers.

Risk: future agents will accidentally change cross-cutting behavior while trying to change one domain.

Recommendation: split by application-service domain:

- `platform/lookupService.ts`;
- `platform/actionService.ts`;
- `platform/provenance/sourceContext.ts`;
- `platform/translationService.ts`;
- `platform/listService.ts`;
- `platform/userDictionaryService.ts`;
- `platform/projection/*` for response shaping.

This is a follow-up refactor, not a blocker. Do it only with characterization tests around existing route payloads.

### P1 — DB provenance behavior is layered through override migrations

The provenance RPC is redefined across several migrations. That is acceptable for migration history, but it makes future reasoning harder.

Risk: agents may edit the wrong migration or misunderstand the final active RPC definition.

Recommendation:

- keep historical migrations immutable;
- add a current-state reference doc for active RPC behavior;
- add characterization tests before any SQL cleanup;
- only create a consolidating migration if necessary for new behavior.

Do not rewrite historical migrations just for neatness.

### P1 — AudioFilms extension orchestration is too large

`extensions/youtube-shadowing/src/content.js` is a large no-build extension file with many responsibilities.

Risk: safe changes become difficult because dictionary provenance, UI rendering, playback, and debugging are interleaved.

Recommendation: extract small no-build modules in order:

1. source binding and source-context builder;
2. dictionary command/action lifecycle;
3. phrase tokenization/click locator;
4. debug/report formatting;
5. layout/preferences.

Do not rewrite to TypeScript or a bundler as part of this provenance work unless the extension project separately commits to that migration.

### P2 — 2000NL docs need stronger normative principles

The current docs describe the system but do not yet make the new provenance rules hard enough for future agents.

Recommendation: use `platform-engineering-principles.md` as the normative baseline for future changes.

### P2 — Source-context v2 accepts future private kinds before Pontix is ready

The platform currently accepts `web_page`, `text_document`, and `ebook` private-source shapes. Pontix is deferred.

This is not automatically wrong because server-side private normalization exists. The product risk is that a future client might treat this as a complete Pontix implementation contract.

Recommendation:

- keep Pontix-specific UI/client work out of this slice;
- if any client starts using private source kinds, require a separate client-readiness review;
- do not infer full web/ebook product readiness from the platform accepting these kinds.

### P2 — CI paths may miss documentation-only architecture changes

Runtime tests exist, but future architecture guidance can drift if docs are not reviewed with code changes.

Recommendation: when changing Platform action/provenance behavior, require updates to:

- Platform API reference;
- architecture principles when boundaries change;
- route tests and DB tests.

## What not to refactor now

Do not touch these unless a concrete feature requires it:

- FSRS algorithm;
- `mark-known -> easy` and `mark-unknown -> fail` mapping;
- lookup read-only policy;
- AudioFilms backend proxy model;
- fallback phrase builder removal;
- broad dictionary provider cleanup;
- Pontix;
- a shared external-client SDK.

## Recommended sequence

1. Add architecture/principles docs. This is safe and should happen immediately.
2. Create follow-up issues for module decomposition. Do not perform large refactors opportunistically.
3. Keep existing provenance behavior stable while adding UI/read-model consumers.
4. Defer Pontix until the project is ready for a proper security and product pass.

## Acceptance criteria for future work

Any future change in this area should satisfy these checks:

- lookup remains read-only;
- all learning mutations go through explicit Platform actions;
- `clientEventId` is generated per intentional action and reused only for transport retry;
- source canonical identity is server-owned;
- observations and diagnostics do not control idempotency;
- raw private source data is minimized and redacted by default;
- current card state and immutable source/action history remain separate;
- AudioFilms never simulates 2000NL card/FSRS state;
- service workers keep tokens out of content scripts;
- tests cover both route behavior and DB/RPC behavior when trust boundaries change.