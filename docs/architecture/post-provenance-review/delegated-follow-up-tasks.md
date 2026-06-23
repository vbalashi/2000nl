# Delegated post-provenance follow-up tasks

Date: 2026-06-23

These tasks are intentionally framed for future implementation agents. They are not urgent runtime blockers, and they should not be done as drive-by cleanup.

## Task A — Decompose 2000NL Platform application services

### Classification

Follow-up cleanup.

### Problem

`apps/ui/lib/platform/platformApi.ts` has grown into a broad application module. It mixes lookup, translation, action handling, source-context normalization, user lists, user dictionaries, projections, and helper logic.

The code works, but future changes are risky because unrelated domains live in one file.

### Goal

Split the file into smaller domain services without changing public Platform behavior.

### Suggested target modules

- `apps/ui/lib/platform/lookupService.ts`
- `apps/ui/lib/platform/actionService.ts`
- `apps/ui/lib/platform/sourceContext.ts`
- `apps/ui/lib/platform/provenanceService.ts`
- `apps/ui/lib/platform/translationService.ts`
- `apps/ui/lib/platform/listService.ts`
- `apps/ui/lib/platform/userDictionaryService.ts`
- `apps/ui/lib/platform/projections/*`

### Rules

- Preserve all existing public route payloads and error codes.
- Do not change FSRS behavior.
- Do not change action/result mappings.
- Do not modify DB migrations except for tests or small supporting additions.
- Do not add a shared cross-repo SDK.
- Do not include Pontix work.

### Required tests before and after

- `npm run test:platform`
- focused tests for Platform actions, lookup, learning routes, and translation routes;
- typecheck;
- lint.

If DB behavior is touched, also run DB/RPC tests.

### Acceptance criteria

- Public route behavior is unchanged.
- The source-context normalizer has a clear isolated API.
- Explicit Platform actions are easier to audit.
- Lookup remains read-only.
- Provenance mutation remains atomic with card-state mutation.

## Task B — Add current-state reference docs for active provenance RPC behavior

### Classification

Follow-up cleanup.

### Problem

The active `perform_platform_card_action` behavior is defined by layered migrations. This is normal for migration history but hard for future agents to understand.

### Goal

Add a current-state reference doc that explains the active behavior without rewriting historical migrations.

### Suggested file

`docs/reference/platform-provenance-rpc.md`

### Content to include

- supported actions;
- v1 versus v2 behavior;
- source/artifact/location/event write order;
- idempotency rules;
- review `clientEventId` / `turnId` rules;
- trusted actor fields;
- private-source canonicalization;
- duplicate and conflict behavior;
- rollback expectations.

### Rules

- Do not rewrite historical migrations.
- Do not make the doc a second source of truth for schema. Link to migrations and tests.
- Update the doc only when active RPC behavior changes.

## Task C — Keep Platform read model privacy-safe

### Classification

Follow-up cleanup / hardening.

### Problem

The learning activity/card read APIs intentionally avoid returning raw source-context JSON. Future UI work may be tempted to expose more detail.

### Goal

Add response contract tests that prevent accidental leakage.

### Test assertions

Default read API responses must not include:

- raw `source_context`;
- private source titles;
- private raw context;
- diagnostics arrays;
- URL credentials or fragments.

YouTube public source rows may expose canonical watch URLs. Private source kinds should expose only safe normalized summaries.

## Task D — Add issue template or checklist for Platform contract changes

### Classification

Nice-to-have.

### Goal

Make future agents declare whether they changed:

- lookup read-only behavior;
- action IDs or result IDs;
- FSRS behavior;
- source-context versions;
- privacy or retention rules;
- connected-client scopes;
- public response shapes;
- DB/RPC behavior.

This reduces architectural drift.