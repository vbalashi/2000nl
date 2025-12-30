# Data Model

Canonical tables (PostgreSQL):

- `languages(id, code, name)` – language catalog.
- `dictionaries(id, code, language_id, name, source, version)` – dictionary sources per language.
- `headwords(id, dictionary_id, headword, part_of_speech, lemma_key, phonetics, metadata JSONB)` – base entries.
- `meanings(id, headword_id, meaning_rank, definition, context, examples JSONB, idioms JSONB, audio JSONB, metadata JSONB)` – flattened meanings.
- `notes(id, headword_id, meaning_id, template JSONB)` – full template instance from shared schema; `meaning_id` nullable if not flattened.
- `lists(id, dictionary_id, name, kind {system|user}, metadata JSONB)` – word lists (e.g., NT2 2k or user-created).
- `list_entries(id, list_id, headword_id, meaning_id NULLABLE, rank, metadata JSONB)` – membership of headwords/meanings in lists.
- `users(id, auth_ref, prefs JSONB)` – user identities and preferences.
- `user_progress(id, user_id, headword_id, card_type, success_score, seen_count, last_seen_at, clicks_count, per_scenario JSONB)` – spaced-repetition style progress per scenario/card type.
- `user_events(id, user_id, headword_id, card_type, event_type, payload JSONB, created_at)` – audit/log of interactions (clicks, reveals, answers).

JSON Schemas:
- Language note templates live at `packages/shared/schemas/<lang>/note.schema.json` (see NL example).
- Card types defined at `packages/shared/card-types/card-types.json`.

Guidelines:
- Prefer normalized tables (`headwords`, `meanings`) with the denormalized template retained in `notes` for fidelity.
- `meaning_id` may be null when storing whole-headword templates; ingestion fills when meaning-level data exists.
- Use `metadata` JSONB for per-dictionary quirks to avoid frequent schema churn.
