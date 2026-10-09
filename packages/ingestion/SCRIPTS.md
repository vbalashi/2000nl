# Ingestion Scripts

Timestamps from filesystem (local timezone):

| Script | Last modified | Purpose |
| --- | --- | --- |
| `packages/ingestion/scripts/process_raw_words.py` | 2026-07-29 | Parse raw Van Dale HTML into structured, collision-safe JSON artifacts and a deterministic checksummed source manifest. |
| `packages/ingestion/scripts/generate_source_reconciliation_plan.py` | 2026-07-29 | Reconcile the first versioned manifest with existing production UUIDs and fail closed on ambiguous or unreviewed matches. |
| `packages/ingestion/scripts/import_words_db.py` | 2026-09-30 | Deploy a versioned manifest via staging: bulk-insert fresh nodes and reconcile changed existing nodes. Local 18,163-artifact measurement: initial 20.39s, no-op 8.78s, one-entry update 16.73s. |
| `packages/ingestion/scripts/benchmark_source_import.py` | 2026-09-30 | Exercise initial/no-op/one-entry update with stage timings and budgets in an owned disposable loopback DB; source files and the canonical DB are preserved. |
| `packages/ingestion/scripts/import_word_forms.py` | 2026-07-29 | Rebuild inflected/derived forms by versioned source-entry key; exact manifest/binding coverage is required. |
| `packages/ingestion/scripts/generate_complete_fixture_dictionaries.py` | 2026-09-20 | Generate four synthetic multilingual QA dictionaries with complete VanDale-shaped entries and manifests. |
| `packages/ingestion/scripts/dictionary_identity_wave0_audit.py` | 2026-07-24 | Generate or verify the deterministic read-only Wave 0 source manifest, collision report, and hashes under `docs/architecture/evidence/dictionary-identity-wave0/`. |
| `packages/ingestion/scripts/lexicography_eval.py` | 2026-08-11 | Run the local clean-room learner-dictionary benchmark: prepare isolated splits, generate prompt candidates, judge, compare, and render the blind review bundle. |
| `packages/ingestion/scripts/audit_pointer_meanings.py` | 2026-08-13 | Classify exact, resolvable pointer-only meanings separately from ordinary hyphenated content in a bounded source sample. |
| `packages/ingestion/scripts/audit_vandale_classification.py` | 2026-09-11 | Reparse a checksummed Van Dale manifest and emit a read-only source-shape, artifact, fingerprint, and Platform V2 node diff. |
| `packages/ingestion/scripts/reconcile_vandale_drop.py` | 2026-09-11 | Fail-closed, single-entry #341 reconciliation; requires the approved manifest, exact old state, and a pre-operation snapshot before any write. |

The Van Dale data directory must contain `_manifest.jsonl` and
`_manifest.summary.json`. Manifest-free natural-key writes are rejected;
committed tests generate small versioned manifests and exercise the same
source-binding path as the production importer.

For the synthetic local dictionaries, use
`scripts/import-complete-local-dictionaries.sh`; it runs the same versioned
entry importer and then rebuilds dictionary-scoped forms.

For the full Van Dale corpus, expected runtime, internal stages, and guidance on
when an import is actually needed are documented in
[`docs/runbooks/dictionary-import.md`](../../docs/runbooks/dictionary-import.md).
