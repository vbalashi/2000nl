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

- [x] Record start checkpoint and prove the recovery worktree is clean.
- [x] Port tests and public response type; record the expected red result.
- [x] Port provider, prompts, route, migration, bootstrap, and API docs; restore green.
- [x] Commit rich translation as an independent semantic change.
- [x] Port and validate the deploy workflow filter; commit independently.
- [x] Port the #53 glossary terms without implementing #53; commit independently.
- [x] Run focused tests, typecheck, lint/diff checks, and workflow validation.
- [ ] Run independent Standards and Spec reviews against the fixed base.
- [ ] Push exact SHA, open a draft PR, and record review-ready evidence.
- [x] Document the guardrail failure timeline and remaining enforcement gaps.

## Validation evidence

Code validation SHA: `ddca591624e7e90565d505e390ff2d08f4a4d317`

- TDD red: the two recovered public-seam tests failed before implementation
  recovery, one because `translateWithContextAndNote` was not called and one
  because `literalTranslations` was absent.
- Policy-identity red: the text-translation route test failed while the rich
  contract still persisted `platform-text-translation-v1`.
- Focused green: 33/33 route and provider tests.
- Full UI suite: 352 passed, 50 skipped.
- TypeScript typecheck: pass.
- Next.js lint: pass without warnings.
- `actionlint` for `deploy-nuc.yml`: pass.
- `git diff --check`: pass.
- Local Supabase bootstrap applied with `ON_ERROR_STOP=1`: pass.
- Migration 103 columns verified through `information_schema`; a second
  migration application passed, proving idempotence.
- DB-backed FSRS RPC/parity suite: 50/50 pass.
- Rich translation now uses `platform-text-translation-v2` in artifact
  identity, so pre-rich V1 cache rows cannot satisfy the new request identity.

## Guardrail incident analysis

### Timeline

1. The deploy filter, source-label glossary, and rich-translation work were
   written between 2026-06-25 and 2026-06-29.
2. The dev-wide agent-work contract and program coordination additions were
   committed on 2026-07-26. The original orphaned work therefore predates these
   rules.
3. The 2026-07-26 manual audit correctly identified the default checkout as
   occupied evidence and directed future work to isolated worktrees.
4. WorkGate repository adoption was not applied. WorkGate issue #4 and draft PR
   #18 were later closed as an over-broad experiment; 2000NL adoption issues #81
   and #82 remain open.
5. The only active 2000NL Git hook is the January migration checker. It does
   not check claims, branch/worktree ownership, dirty state, pushed state, or
   integration, and it exits zero.
6. On 2026-07-29 an agent temporarily edited the stale default checkout's
   `CONTEXT.md` after the policy existed. The edit was removed, but it proves
   that a text-only start rule can be missed.
7. Issue #70 demonstrates the successful manual path: explicit claim, isolated
   worktree, clean exact-SHA checkpoint, push, and draft PR.

### Conclusion

The policy did prevent the old dirty checkout from contaminating #69 and #70,
but it could not retroactively recover pre-policy work and it had no
deterministic SessionStart enforcement. The remaining atomic gap is start-time
visibility, not another broad transactional hook system.

The qualifying incident and bounded correction are recorded in
`vbalashi/workgate#20`, under the incident registry `vbalashi/workgate#19`.
That issue authorizes evaluation of a read-only Codex SessionStart status
injection only; it does not reopen the parked WorkGate adoption design.

## Stop rules

- Stop if the source hashes change before the relevant cluster is recovered.
- Stop on an active overlapping claim.
- Do not renumber migration `103`; production already contains that schema.
- Do not reset, stash, delete, move, or commit anything in
  `/Users/khrustal/dev/2000nl`.
- Do not mark Done until the reviewed branch is integrated and verified on
  `main`.
