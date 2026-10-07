# #610 — approved presentation retirement

Live lifecycle: https://github.com/vbalashi/2000nl/issues/610 (child of #255).
Decision: ../../discussions/2026-10-07-01-ui-retirement-and-refactor.md.

## Baseline and ownership

Base: 9aa380ea6fcaccd2ce7c0c478fa4465911c91158. Public production health on 2026-10-07 reported the same commit, release 0.18.1190, status ok, DB contract 214 and both presentation switches enabled. Reference main is stale and dirty; it is not the implementation checkout.

Root integrates in `.worktrees/610-presentation-retirement`. Separate navigation, Library, Training and browser-test worktrees prevent shared-index or file races. Luna handles inventory/navigation/Library/browser specs; Sol handles coupled Training state/presentation; root reviews domain ownership and test equivalence.

## Behavioral contract

The result must match the baseline with both presentation flags enabled. A feature visible only in the old branch is not automatically ported to the approved UI. Shared preference loading, session authority/resume/completion, late-response fencing, account material access, translation-off and mobile focus/scroll behavior remain supported. Public Platform flags/APIs, FSRS, applied migrations and provider normalization are outside this deletion.

## Reviewable sequence

1. Preserve approved-path characterization and capture baseline checks.
2. Retire old navigation/settings/statistics, Training, Library and article branches.
3. Remove the two flags from build/config/health/deployment and stop skipping approved browser tests.
4. Integrate, audit actual callers (including dev routes), remove newly orphaned code, add retirement guard and run combined checks.
5. Reassess remaining Setup/Library ownership after deletion. Keep domain extraction in a separate commit/slice with tests before movement; do not create a second session-state owner.
6. Independent review and exact-head evidence/PR. Review-ready is not integrated or deployed.

## Validation evidence

Baseline full Vitest on unchanged runtime/unit source at 9aa380ea: 235 files passed, 35 skipped; 2078 tests passed, 339 skipped. Skips include optional DB/integration suites; this is not DB validation.

Initial config/health change: 14 tests passed. Browser spec discovery after migration: 248 tests in 44 files. Integrated runtime execution is recorded below when completed.

## Follow-on architecture seams

- Setup: saved-training intent resolution and start-draft validation belong next to `lib/training/setups`, not a catch-all hook. Existing account setup/material hooks remain sole owners of persistence and availability.
- Library: grouped search already has `useLibraryHeadwordGroupSearch`. Any remaining list-search request key/cache/dedupe/page handling should be a narrow owner, distinct from entry editing and details.
- Training: snapshot/replan decisions may be extracted behind characterization, but generation refs, session identity and queue effects must remain under one coordinator. Do not split by file length alone.

These are design directions pending post-deletion assessment, not implemented behavior or duplicate live task status.

## Post-deletion assessment

The initial source retirement reduces `TrainingTodaySetup.tsx` from 1,473 to 530 lines. It already delegates account recipes and availability to domain hooks; another extraction is not justified by its size alone. `DictionarySearchTab.tsx` remains 982 lines and `TrainingScreen.tsx` 2,864. Keep their further decomposition outside this retirement change so behavior changes are attributable.

The next useful Library boundary is the non-grouped/list-filter search request owner: request identity, debounce, abort/stale fencing, freshness reuse, pagination resets and retry. Grouped search stays in its existing hook; selected details and public entry APIs stay outside this extraction. Characterize language isolation, scope changes, stale queries and retained details first.

The later Training boundary is a narrow snapshot/reconciliation decision projection. Preserve one owner for generation refs, accepted mutations, queue loading/reset and invalidation subscriptions. Its acceptance must include takeover, offline recovery, session A/B late responses, resume and coalesced/retried replans. Do not replace the screen with a catch-all hook.

Style audit comparison also found pre-existing untokenized styles in `trainingOverview.module.css` and excess literals in `approvedTrainingCard.module.css` and `startupLogo.module.css`. The baseline also reported excess literals in `DictionarySearchTab.tsx`, eliminated by this retirement. Existing debt allowances were lowered after deletion; no new allowance was added to hide unrelated failures.
