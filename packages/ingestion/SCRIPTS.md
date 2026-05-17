# Ingestion Scripts

Timestamps from filesystem (local timezone):

| Script | Last modified | Purpose |
| --- | --- | --- |
| `packages/ingestion/scripts/process_raw_words.py` | 2025-12-09 22:57:05 +0100 | Parse raw Vandale HTML from `data/word_list.json` into structured JSON files under `data/words_content/`, splitting multi-meaning entries and adding metadata. Run from a source-data directory such as `packages/ingestion/nl/vandale-nt2/`. |
| `packages/ingestion/scripts/import_words_db.py` | 2025-12-09 22:57:18 +0100 | Load structured JSON entries into a dictionary in Postgres (languages, dictionaries, word_entries, lists) using `importer.core.import_entries`; defaults to `nl-vandale`; writes progress to `import.log`. |
| `packages/ingestion/scripts/import_word_forms.py` | 2025-12-09 22:57:13 +0100 | Extract inflected/derived forms from structured JSON and populate `word_forms` table for fast lookup. |

Data expectation: well-crafted source files live under a source-data directory such as `packages/ingestion/nl/vandale-nt2/data/words_content/`, or any path supplied to importer scripts via CLI flags.
