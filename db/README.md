# Database runtime map

`db/` is the source of truth for the Postgres schema, learning state, FSRS
scheduling, and database-side Platform contracts. Runtime callers should use
the card-oriented contracts documented in [`packages/docs/data-model.md`](../packages/docs/data-model.md)
and [`docs/reference/api-functions/training-and-queue.md`](../docs/reference/api-functions/training-and-queue.md).

## Migration sources of truth

- `db/migrations/001_*.sql` through the current numbered migration (`149` at
  the time of writing) are the ordered schema history. Do not renumber or edit
  an already deployed migration.
- `db/migrations/bootstrap.sql` includes that complete numbered chain. It is
  for a fresh, disposable database only; it does not create production
  deployment receipts or restore production data.
- `db/deploy-contract/ledger-v1.sql` creates the immutable deployment ledger
  before the first managed forward migration. The later managed sequence is
  declared by `packages/shared/deployment/db-contract.json` and currently
  covers migrations `123` through `149` after baseline `122`.
- `db/deploy-contract/` contains the checksum-pinned baseline, pre-switch,
  and postflight probes for the deployment contract.

The manifest is the application-owned database contract. It currently declares
contract `2000nl-db-149`, required migration `149`, and the exact checksums for
every managed migration and probe. Inspect or validate it without a database:

```bash
node db/scripts/deploy_db_contract.mjs expected
node db/scripts/deploy_db_contract.mjs rollout-status
node db/scripts/deploy_db_contract.mjs validate
```

## Which workflow to use

For a populated local, staging, or production-shaped database, use the
fail-closed contract runner and its documented stop conditions:

- [`db/scripts/README.md`](scripts/README.md) — command reference;
- [`docs/runbooks/nuc-db-contract-deploy.md`](../docs/runbooks/nuc-db-contract-deploy.md)
  — reviewed deployment-gate workflow;
- [`docs/runbooks/local-supabase-test-env.md`](../docs/runbooks/local-supabase-test-env.md)
  — safe local reuse and disposable-database rules.

Never make manual schema changes in a dashboard or with ad-hoc SQL. A reviewed
schema change is a new numbered migration, followed by the required contract
manifest, probes, and validation updates.

For a fresh disposable local database only:

```bash
scripts/db-local-supabase.sh start
scripts/db-local-supabase.sh apply
scripts/db-local-supabase.sh probe
```

For the existing populated local stack, start with the read-only check instead:

```bash
scripts/db-local-supabase.sh check
```

Do not apply bootstrap or reset a populated QA database to silence a failed
check. Preserve the data and follow the local Supabase runbook.

## Runtime data model

- `word_entries` stores immutable dictionary content and meaning-level identity.
- `user_card_status` stores per-user, per-entry, per-card scheduling state.
- `user_review_log` and `user_card_action_events`/`user_events` preserve review
  and action history; current state and immutable history are separate models.
- `training_scenarios` groups supported card modes for Training.
- `dictionaries`, `dictionary_entitlements`, and gated lookup contracts enforce
  dictionary access at the database boundary.
- `word_lists` and user list tables provide the selectable training scope.
- `word_entry_translations` and `user_word_notes` store shared translation
  overlays and user-owned notes.

The full table and card identity map lives in
[`packages/docs/data-model.md`](../packages/docs/data-model.md). Shared payload
schemas and card IDs live under `packages/shared/`.

## Runtime boundaries

- `apps/ui` calls the authenticated Platform facade; it must not invent
  scheduler state or mutate learning tables directly.
- Lookup and selection reads are side-effect free. Review, Learn, Known, and
  other state changes go through explicit Platform actions.
- FSRS or review-state changes require database-side validation plus the
  relevant `apps/ui/tests/fsrs` coverage.
- Local database checks should use `scripts/db-local-supabase.sh`; direct
  `psql` access is for reviewed diagnostics and uses `db/scripts/psql_supabase.sh`.

## Canonical references

- [`AGENTS.md`](../AGENTS.md) — repository routing and validation;
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — system boundaries and safe changes;
- [`docs/architecture/post-provenance-review/platform-engineering-principles.md`](../docs/architecture/post-provenance-review/platform-engineering-principles.md)
  — Platform and learning-state guardrails;
- [`packages/shared/deployment/db-contract.json`](../packages/shared/deployment/db-contract.json)
  — commit-owned deployment contract;
- [`db/scripts/README.md`](scripts/README.md) — database helper and gate scripts;
- [`docs/reference/api-functions/`](../docs/reference/api-functions/) — current
  Platform function contracts.
