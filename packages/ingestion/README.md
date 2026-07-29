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

`process_raw_words.py` produces a checksummed `vandale-structured-v2`
manifest. The supported Van Dale import path requires that manifest and uses
versioned source-entry bindings, so homographs can coexist without changing
existing Platform UUIDs. `import_words_db.py` defaults to the seeded
`nl-vandale` dictionary and `nl-vandale-v2` schema. The legacy natural-key
path is available only through the explicit test-fixture flag.

Run `import_word_forms.py` after the entry import. For a versioned corpus it
resolves each entry through the source-binding ledger and fails closed if the
manifest and active bindings do not have exact coverage.
