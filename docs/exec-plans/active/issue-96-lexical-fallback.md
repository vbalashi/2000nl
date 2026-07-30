# Issue 96: lexical-form grouped-search fallback

Status: active

Issue: https://github.com/vbalashi/2000nl/issues/96

## Objective

Recover the intended lexical-form fallback from preserved commit `c21a073f`
onto current `main`, without reusing its now-conflicting migration number or
restoring arbitrary substring matches.

## Fixed points and claims

- Base: `702b449352f6e3b064221e20964953e33d9c4b30`
- Historical source:
  `c21a073f11751c563408d0c1ae1e770ada2e96fe`
- Owning layer: Postgres dictionary grouped-search RPC plus its DB-backed
  regression in `apps/ui/tests/fsrs/fsrsRpc.test.ts`.
- Claimed migration number: `104`, free in integrated `main` at start.
- A stale parser worktree also contains an unintegrated
  `104_versioned_source_entry_bindings.sql`; PR #88 integrated that behavior as
  migration 102. It is superseded evidence, not an active migration claim.
- No production database mutation is authorized.

## Public seam

`private.search_dictionary_body_group_v1` as exposed through the grouped
dictionary-search RPC contract.

The fallback may match trusted lexical forms at token boundaries. It must not
match an arbitrary occurrence of the query inside an unrelated token.

## Slices

- [x] Verify current `main`, competing worktrees, and the next migration number.
- [ ] Port only the historical DB/RPC regression and prove it fails.
- [ ] Add collision-free migration 104 and equivalent bootstrap definition.
- [ ] Restore the regression and the complete DB-backed suite to green.
- [ ] Update current grouped-search documentation with the new migration path.
- [ ] Run bootstrap, migration idempotence, typecheck/lint, and diff checks.
- [ ] Run independent Standards and Spec reviews.
- [ ] Push exact SHA, open a draft PR, and record review-ready evidence.

## Stop rules

- Do not reuse migration number 102.
- Recheck `origin/main` and open migration claims before the implementation
  commit.
- Do not copy the historical bootstrap or documentation wholesale over their
  newer versions.
- Stop if the regression is already green on current `main`; that would require
  a superseded rather than integrate classification.
- Do not deploy or apply the migration to production.
