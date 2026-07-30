# Issue 93: stale main-checkout recovery

Status: active

Issue: https://github.com/vbalashi/2000nl/issues/93

## Objective

Recover three independently authored changes from the stale local `main`
checkout onto current `origin/main`, without modifying or cleaning the original
checkout during recovery.

## Fixed points

- Recovery base: `9772e516fbf72016fc9321db5abb2d7707e698fb`
- Stale checkout HEAD: `ca5fbe6a78720da3ee2c1499ffc3bf29027a19a3`
- Complete tracked source diff SHA-256:
  `3f53e0963a3eb8834ba1ccc8aeec075c7d00a34492d8f47265c16f9d1d0f6b03`
- Rich-translation source diff SHA-256:
  `3ddd7d71702ee78c7ab555669301883b4140325a1b739db930bc888fe5941751`
- Migration 103 SHA-256:
  `07e2bb15e48c56ded60ddea4e9f27858e4d068aab3f3a7d48373dfcdb385655d`
- Deploy-filter source diff SHA-256:
  `f7a989d7cd7bf5b87c13510185223b0d534f674e8a9269a8b82e9b8276ffbc8f`
- Glossary source diff SHA-256:
  `c57e59d869b31f5800303a930806fcb7382a5ae03716b9cb7db801f7dd121e5b`

## Claims

- Rich text-translation response fields and cache persistence.
- Migration number `103`, already applied in production for rich translation.
- `.github/workflows/deploy-nuc.yml` path filters.
- The two source-label terms in `CONTEXT.md`.
- No AudioFilms, SenseCard V2, #53 storage, parser, Pen, or QA-artifact changes.

## Public test seams

These seams predate the recovery and were already exercised when the feature
was deployed:

1. `POST /api/platform/v1/text-translation`
2. `OpenAITranslator.translateWithContextAndNote`

The existing route and provider tests are the behavioral contract. Recovery
must reproduce their failing state before the implementation files are ported,
then restore green.

## Slices

- [ ] Record start checkpoint and prove the recovery worktree is clean.
- [ ] Port tests and public response type; record the expected red result.
- [ ] Port provider, prompts, route, migration, bootstrap, and API docs; restore green.
- [ ] Commit rich translation as an independent semantic change.
- [ ] Port and validate the deploy workflow filter; commit independently.
- [ ] Port the #53 glossary terms without implementing #53; commit independently.
- [ ] Run focused tests, typecheck, lint/diff checks, and workflow validation.
- [ ] Run independent Standards and Spec reviews against the fixed base.
- [ ] Push exact SHA, open a draft PR, and record review-ready evidence.
- [ ] Document the guardrail failure timeline and remaining enforcement gaps.

## Stop rules

- Stop if the source hashes change before the relevant cluster is recovered.
- Stop on an active overlapping claim.
- Do not renumber migration `103`; production already contains that schema.
- Do not reset, stash, delete, move, or commit anything in
  `/Users/khrustal/dev/2000nl`.
- Do not mark Done until the reviewed branch is integrated and verified on
  `main`.

