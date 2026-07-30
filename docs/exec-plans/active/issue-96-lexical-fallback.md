# Issue 96: lexical-form grouped-search fallback

Status: active

Issue: https://github.com/vbalashi/2000nl/issues/96

Required contract references:

- [`platform-engineering-principles.md`](../../architecture/post-provenance-review/platform-engineering-principles.md)
- [`platform-api.md`](../../reference/platform-api.md)
- [`platform-contract-change-checklist.md`](../../reference/platform-contract-change-checklist.md)

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

## Contract impact

- [x] Lookup remains read-only; no card or user mutation is introduced.
- [x] Action IDs, review result IDs, FSRS scheduling, and review behavior are
      unchanged.
- [x] Source-context versions, privacy/retention, and connected-client scopes
      are unchanged.
- [x] Public request and response shapes are unchanged.
- [x] DB/RPC result selection changes through migration 104 and is documented
      in the Platform API reference.
- [x] AudioFilms and Pontix require no fixture change because the versioned
      response shape is unchanged; they receive the corrected result set.
- [x] Live rollout status: not applied. Production deployment is explicitly out
      of scope for this PR.

## Slices

- [x] Verify current `main`, competing worktrees, and the next migration number.
- [x] Port only the historical DB/RPC regression and prove it fails.
- [x] Add collision-free migration 104 and equivalent bootstrap definition.
- [x] Restore the regression and the complete DB-backed suite to green.
- [x] Update current grouped-search documentation with the new migration path.
- [x] Run bootstrap, migration idempotence, typecheck/lint, and diff checks.
- [ ] Run independent Standards and Spec reviews.
- [ ] Push exact SHA, open a draft PR, and record review-ready evidence.

## Validation evidence

- TDD red at test-only SHA `191d72f7`: the second grouped-search page returned
  the unrelated `*-midword` entry instead of the trusted `*-prefix` lexical
  form.
- Focused green after local migration 104: 1/1, 45 skipped.
- Migration 104 applied twice with `ON_ERROR_STOP=1`: pass.
- Full bootstrap including migration 104: pass.
- DB-backed FSRS/RPC suite: 50/50 pass.
- TypeScript typecheck: pass.
- Next.js lint: pass without warnings.
- `git diff --check`: pass.
- Representative short-query probe on a rolled-back local fixture with 18,000
  documents, 36,006 fields, and six forms for `de`:
  - historical unguarded prepass: 5.039 ms, 1,502 shared buffers;
  - length-gated prepass: 4.464 ms, 1,456 shared buffers;
  - no fixture rows or migration state were committed by the probe.

## Stop rules

- Do not reuse migration number 102.
- Recheck `origin/main` and open migration claims before the implementation
  commit.
- Do not copy the historical bootstrap or documentation wholesale over their
  newer versions.
- Stop if the regression is already green on current `main`; that would require
  a superseded rather than integrate classification.
- Do not deploy or apply the migration to production.
