# packages/ingestion

Validates scraped artifacts, normalizes them, and loads them into the database.

Responsibilities:
- Validate raw artifacts against shared JSON Schemas (`packages/shared/schemas`).
- Normalize to relational tables (languages, dictionaries, headwords, meanings, notes, lists).
- Apply migrations located in `/home/khrustal/dev/2000nl-ui/db/migrations`.
- Log rejects with reasons for cleanup.

Scripts (see `packages/ingestion/SCRIPTS.md` for timestamps and details):
- `process_raw_words.py` – parse Vandale HTML (`data/word_list.json`) into structured `data/words_content/`.
- `import_words_db.py` – load structured entries into Postgres and seed NT2 list.
- `import_word_forms.py` – populate `word_forms` lookup from structured entries.
