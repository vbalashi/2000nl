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
- `lexicography_eval.py` – run the local clean-room prompt benchmark and blind
  review workflow described in `lexicography_eval/README.md`.
- `audit_pointer_meanings.py` – audit a bounded, deterministic corpus sample for
  resolvable pointer-only meanings without treating arbitrary hyphens as
  redirects.

`process_raw_words.py` produces a checksummed `vandale-structured-v2`
manifest. The supported Van Dale import path requires that manifest and uses
versioned source-entry bindings, so homographs can coexist without changing
existing Platform UUIDs. `import_words_db.py` defaults to the seeded
`nl-vandale` dictionary and `nl-vandale-v2` schema. Manifest-free
natural-key writes are rejected, including for test fixtures; committed tests
generate a small versioned manifest instead.

Source generation promotes a meaning to the explicit `cross_reference`
contract only when its entire local content is one exact token ending in `-`
and that token is also a source headword. Meanings with examples, notes,
relations, grammar, or other local content remain learnable meanings even when
their definition contains a hyphen.

Run `import_word_forms.py` after the entry import. For a versioned corpus it
resolves each entry through the source-binding ledger and fails closed if the
manifest and active bindings do not have exact coverage.
