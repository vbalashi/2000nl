# Ingestion Scripts

Timestamps from filesystem (local timezone):

| Script | Last modified | Purpose |
| --- | --- | --- |
| `packages/ingestion/scripts/process_raw_words.py` | 2025-12-09 22:57:05 +0100 | Parse raw Vandale HTML from `data/word_list.json` into structured JSON files under `data/words_content/`, splitting multi-meaning entries and adding metadata. |
| `packages/ingestion/scripts/import_words_db.py` | 2025-12-09 22:57:18 +0100 | Load structured JSON entries into Postgres (languages, word_entries, lists) using `importer.core.import_entries`; writes progress to `import.log`. |
| `packages/ingestion/scripts/import_word_forms.py` | 2025-12-09 22:57:13 +0100 | Extract inflected/derived forms from structured JSON and populate `word_forms` table for fast lookup. |

Data expectation: well-crafted source files live under `packages/ingestion/data/words_content/` (or provided path via CLI flags).
