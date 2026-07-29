# Ingestion Scripts

Timestamps from filesystem (local timezone):

| Script | Last modified | Purpose |
| --- | --- | --- |
| `packages/ingestion/scripts/process_raw_words.py` | 2026-07-29 | Parse raw Van Dale HTML into structured, collision-safe JSON artifacts and a deterministic checksummed source manifest. |
| `packages/ingestion/scripts/generate_source_reconciliation_plan.py` | 2026-07-29 | Reconcile the first versioned manifest with existing production UUIDs and fail closed on ambiguous or unreviewed matches. |
| `packages/ingestion/scripts/import_words_db.py` | 2026-07-29 | Import a versioned source manifest through the binding ledger, preserving existing UUIDs and making an identical completed manifest a true no-op. |
| `packages/ingestion/scripts/import_word_forms.py` | 2026-07-29 | Rebuild inflected/derived forms by versioned source-entry key; exact manifest/binding coverage is required. |
| `packages/ingestion/scripts/dictionary_identity_wave0_audit.py` | 2026-07-24 | Generate or verify the deterministic read-only Wave 0 source manifest, collision report, and hashes under `docs/architecture/evidence/dictionary-identity-wave0/`. |

The Van Dale data directory must contain `_manifest.jsonl` and
`_manifest.summary.json`. Manifest-free natural-key writes are rejected;
committed tests generate small versioned manifests and exercise the same
source-binding path as the production importer.
