# Dictionary Search Backfill

Use this runbook to populate `dictionary_search_documents` and
`dictionary_search_fields` without one long production transaction.

## When

Run this after migrations that change search extraction metadata, source paths,
or `extraction_version`. The current grouped-search extraction version is `2`.

## Start Or Resume

Start a new run:

```bash
db/scripts/run_dictionary_search_backfill.sh start 2 500
```

Resume an existing run:

```bash
db/scripts/run_dictionary_search_backfill.sh resume <run-id>
```

Each batch is one separate database command. If the process is interrupted, run
the same resume command again. The cursor is stored in
`dictionary_search_backfill_runs`.

## Inspect Progress

```bash
db/scripts/psql_supabase.sh -c "select get_dictionary_search_backfill_status(null);"
```

Deep health also reports:

- `documentRowCount`
- `fieldRowCount`
- `activeExtractionVersion`
- `staleDocumentCount`
- `groupedSearchIndexReady`
- `pendingBackfill`

## Freshness Policy

- Single-entry user dictionary create/update/delete paths should call
  `refresh_dictionary_search_document(entry_id, 2)` in the same transaction as
  the entry mutation.
- Dictionary imports can refresh touched entries in batches via the existing
  ingestion refresh hook. For full imports, prefer this resumable backfill.
- Word-form rebuilds should either pass touched entry IDs to the ingestion
  refresh hook or run a bounded backfill after the form import completes.

## Failure Recovery

If one batch fails, the transaction rolls back and the run cursor remains at the
last successful batch. Fix the data or migration issue, then resume the same run.

Do not manually edit `dictionary_search_documents` or
`dictionary_search_fields`; use `refresh_dictionary_search_document` or a
resumable backfill run.
