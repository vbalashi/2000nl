# Senior Review Request: Live Migration Readiness

## Request

Act as an independent senior reviewer for the 2000nl migration work. Do not
make live changes. Audit whether the current branch is ready to migrate the
live platform, which currently has only test users, onto the new
dictionary/list/card/user-dictionary schema.

The desired output is a review report, not implementation. If you find fixes
that are required before migration, list them as blockers with concrete file,
SQL, or command references.

## Repository Context

Project: 2000nl, a Dutch learning app moving toward a dictionary-backed
learning platform.

Current branch:

- `codex/stage0-1a-dictionary-boundary`

Most relevant recent commits:

- `a08f268f Validate user dictionary UI slice locally`
- `7d43d4cc Implement user dictionary first UI slice`
- `285b7b7b Implement entry membership navigation and removal`
- `c667c197 Implement multilingual training scope B-track`

The latest completed slice proves that a user can:

- create a private `user-entry-v1` dictionary entry,
- copy a trusted dictionary entry into a private user dictionary,
- see dictionary source metadata in search/detail/list flows,
- add a user-dictionary entry to a learning list,
- train that entry through the existing list/card/FSRS pipeline,
- keep dictionary source, viewed list, learning list, and active training scope
  separate.

## Files To Read First

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/intent/current-transformation-targets.md`
- `docs/exec-plans/active/platform-dictionary-transformation.md`
- `docs/exec-plans/active/user-dictionary-first-ui-slice.md`
- `docs/exec-plans/active/dictionary-schema-and-lookup-review.md`
- `docs/reference/platform-api.md`

Then inspect:

- `db/migrations/`
- `db/migrations/bootstrap.sql`
- `db/scripts/local_supabase_probe.sql`
- `apps/ui/lib/platform/`
- `apps/ui/app/api/platform/`
- `apps/ui/lib/training/`
- `apps/ui/components/training/`
- `apps/ui/tests/`
- `packages/shared/types/`
- `reports/qa/user-dictionary-first-ui-slice/`

## Audit Questions

### 1. Live Migration Safety

- Is the migration chain safe to apply to the current live Supabase project with
  existing test users?
- Are migrations idempotent enough for the expected deployment path?
- Are there destructive operations, table drops, function drops, or backfills
  that need a backup/rollback gate?
- What preflight SQL should be run against live before applying migrations?
- What postflight SQL should prove the migration succeeded?

### 2. Data Integrity

- Will existing test user progress survive the transition to
  `user_card_status` and entry/card terminology?
- Are user lists, curated lists, review logs, settings, translations, and recent
  history preserved?
- Are dictionary entries meaning-level rows consistently handled by
  `entry_id + card_type_id`?
- Are mixed-language lists and duplicate headwords across dictionaries safe?

### 3. Security, RLS, And RPC Grants

- Review RLS/security-definer patterns and RPC grants.
- The local broad probe currently reports these legacy RPCs as still executable
  by PUBLIC/anon:
  - `get_active_word_list(uuid)`
  - `get_available_word_lists(uuid,text,text)`
  - `update_active_word_list(uuid,uuid,text)`
- Decide whether this is a live migration blocker, a pre-existing cleanup, or
  acceptable for the test-user-only rollout.
- Check whether user dictionary entries are private and only editable by the
  owning user.
- Check that ordinary lookup is read-only and mutations go through explicit
  platform actions/RPCs.

### 4. Runtime/API Boundary

- Is `/api/platform/v1/*` sufficient as the current external boundary?
- Does the current app still depend on direct frontend table access in places
  that should be server-side before live migration?
- Is the new `fetch-entry` platform action acceptable as a same-origin read
  helper, or should it be modeled as a separate read route?
- Are bearer tokens, local dev auth, and production auth assumptions cleanly
  separated?

### 5. UI/Product Readiness

- Does the first user-dictionary slice cover enough product behavior for test
  users?
- Should edit/delete user dictionary entry UI block migration, or remain in the
  next slice as currently planned?
- Are source labels, list membership labels, and active training scope behavior
  clear enough to avoid user confusion?

### 6. Test And QA Coverage

- Evaluate whether the current tests cover the live migration risk.
- Review the browser QA evidence in
  `reports/qa/user-dictionary-first-ui-slice/`.
- Identify missing tests or SQL checks that should be added before migration.

## Expected Output

Return a structured report with these sections:

1. `Decision`: one of `ready`, `ready_with_conditions`, or `not_ready`.
2. `Blockers`: must-fix issues before live migration. Include file/function/RPC
   references and why each blocks migration.
3. `High-Risk Non-Blockers`: important issues that can be fixed shortly after
   migration if we accept the risk.
4. `Migration Preflight Checklist`: exact SQL/commands to run before applying
   to live.
5. `Migration Runbook`: recommended deployment sequence, backup point, and
   rollback point.
6. `Postflight Validation`: exact SQL/API/UI checks to run after migration.
7. `Open Questions`: product or architecture decisions that remain.
8. `Suggested Next Patch Set`: concise list of changes you would make next.

Be direct and skeptical. Assume the goal is safe live migration for test users,
not merely passing local tests.

