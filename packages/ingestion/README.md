# packages/ingestion

Validates scraped artifacts, normalizes them, and loads them into the database.

Responsibilities:
- Validate raw artifacts against shared JSON Schemas (`packages/shared/schemas`).
- Normalize to the current relational model: `languages`, `dictionaries`, `word_entries`, `word_forms`, `word_lists`, and `word_list_items`.
- Apply migrations located in `db/migrations`.
- Log rejects with reasons for cleanup.

Scripts (see `packages/ingestion/SCRIPTS.md` for timestamps and details):
- `process_raw_words.py` – parse Vandale HTML (`data/word_list.json`) into structured `data/words_content/` when run from a source-data directory such as `packages/ingestion/nl/vandale-nt2/`.
- `import_words_db.py` – load structured entries into a dictionary in Postgres and seed the NT2 list.
- `import_word_forms.py` – populate `word_forms` lookup from structured entries.

`import_words_db.py` defaults to the seeded `nl-vandale` dictionary and
`nl-vandale-v1` schema. Use `--dictionary-slug`, `--dictionary-name`,
`--dictionary-schema-key`, and `--dictionary-schema-version` when importing a
different source.
