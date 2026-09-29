# Local QA: missing deployment ledger and empty dictionary search index

Status: **open**, recorded 2026-09-29 at 14:25 UTC during #407 UI preview QA.
Owner boundary: local database/runtime tooling, not prototype presentation.

## Reproduction and evidence

Checkout: `.worktrees/407-builder-prototype`, branch `codex/407-builder-prototype`, base `5cc00eb73e54b50dbc74d103394a1b05cc935b66`, dirty preview changes. Existing UI at port 3100 identifies this checkout and `database.target: local`.

Read-only `curl -sS 'http://localhost:3100/api/health?deep=1'` returned:

```json
{
  "status": "warning",
  "databaseContract": {
    "status": "warning",
    "message": "Application and database contracts are incompatible.",
    "details": {
      "expected": "2000nl-db-176",
      "expectedMigration": 176,
      "actual": null,
      "actualMigration": null,
      "compatible": false
    }
  },
  "dictionarySearchIndex": {
    "status": "warning",
    "details": {
      "lookupAvailable": true,
      "groupedSearchIndexReady": false,
      "documentRowCount": 0,
      "fieldRowCount": 0,
      "activeExtractionVersion": null,
      "staleDocumentCount": 0,
      "pendingBackfill": true
    }
  },
  "platformRpcContract": {"status": "ok"}
}
```

These are selected health fields, not the full response. Then `scripts/db-local-supabase.sh check` (read-only SQL transaction, no migrations or reset) reported:

```text
db-contract-gate: valid 2000nl-db-176
dictionary_entries       50
training_scope_entries   10
search_documents          0
search_fields             0
learner_card_states       0
review_history_rows       0
ERROR: Local deployment ledger is absent. Preserve data and use the documented
migration gate; do not insert a version marker manually.
```

Exit code: 3. The gate validates the checked-out manifest first; that line does not mean the live DB passed validation. The SQL check then aborts before the remaining postflight checks.

## What is established, and what is not

1. At least one of `public.app_db_contract_migrations` and `public.app_db_contract_state` is absent. That is the exact condition in `scripts/lib/local-db-check.mjs`, not an inference from null health fields. This check does not identify which of the two is absent.
2. `apps/ui/lib/deployment/dbContractHealth.ts` reads the singleton from `app_db_contract_state`; an empty result or query error is currently reduced to the same incompatible message. It does not expose a safe reason code that distinguishes missing ledger, missing row, permission failure and an actual version mismatch.
3. There is **no evidence here that migration 176 itself is missing**. Per the local QA runbook, a fresh bootstrap deliberately has no managed deployment receipts. Schema provenance needs its own probe, not a made-up version marker.
4. Grouped dictionary search has a separate readiness problem: both index tables have zero rows and no active extraction version. Base lookup's health check passes. Index population is separate from source dictionary import.
5. This local dataset contains 50 dictionary entries and no learning/review records. It must not be mistaken for the full corpus or production progress.

## Repair / acceptance work

- Reproduce with `check` and inspect which ledger relation is missing; run the existing local schema `probe` to establish the actual schema state. Preserve any intentional local data. Do not reset as a workaround for the UI task.
- Decide whether this QA instance is intentionally a bootstrap fixture or is expected to have managed migration receipts. For a managed instance, use the reviewed migration gate in [the deployment runbook](../runbooks/nuc-db-contract-deploy.md), explicitly targeting local DB and supplying its dedicated QA principal. Verify migration effects before issuing receipts. Honour any rollout hold; do not insert contract-state/receipt rows manually.
- Improve the health diagnostic to distinguish an unmanaged/missing ledger signal from a demonstrated incompatible version. Add checks for absent table, absent singleton, denied read and real version mismatch. This needs no disclosure of credentials or raw internal error details in public health.
- Use the local dictionary-search backfill workflow after the schema is verified; check document/field counts and active extraction version, then validate actual grouped search. Do not point the NUC backfill wrapper at production to repair a local QA instance.
- Re-run `check` (for a managed instance), schema probe and deep health. Confirm the application and DB are aligned and search readiness is true before reporting real Library/training integration verified.
- Clarify the canonical local startup/runbook contract so bootstrap mode does not repeatedly look like an unexplained regression. [Local Supabase QA runbook](../runbooks/local-supabase-test-env.md) already documents the bootstrap/managed distinction; startup and health should make it visible.

No database, deployment marker, schema, index or learner state was modified while collecting this evidence. The UI prototype remains fixture-only and does not validate these backend repairs.
