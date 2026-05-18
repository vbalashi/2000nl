# Data Model

Canonical tables live in `db/migrations/001_core_schema.sql` plus additive migrations in `db/migrations`.

Content and lists:
- `languages(code, name)` – language catalog.
- `dictionary_schemas(schema_key, version, language_code, json_schema, checksum, source_path, render_capabilities, retired_at)` – runtime registry for versioned entry payload contracts. Repo files remain the source of truth; DB rows are runtime snapshots/metadata.
- `dictionaries(id, language_code, slug, name, kind, visibility, owner_user_id, is_editable, minimum_subscription_tier, schema_key, schema_version)` – dictionary/source boundary and access metadata.
- `user-entry-v1` (`packages/shared/schemas/user-entry-v1.schema.json`) – minimal editable payload for user-owned dictionaries. It requires `headword`, `languageCode`, and at least one useful content field: `definition`, `translation`, `example`, or `notes`.
- `dictionary_entitlements(dictionary_id, subject_type, subject_key, permission, starts_at, ends_at)` – explicit dictionary grants used by `can_access_dictionary(...)`.
- `word_entries(id, dictionary_id, language_code, headword, meaning_id, part_of_speech, gender, is_nt2_2000, vandale_id, raw, created_at)` – meaning-level dictionary entries. Uniqueness is dictionary-scoped: `(dictionary_id, language_code, headword, meaning_id)`.
- `word_forms(language_code, dictionary_id, form, word_id, headword, created_at)` – inflection/conjugation lookup rows scoped to dictionary entries and meaning identity.
- `word_lists(id, language_code, primary_language_code, slug, name, description, is_primary, sort_order)` – curated/system entry lists such as `vandale-all` and `nt2-2000`. `language_code` remains for compatibility; `primary_language_code` is the forward-compatible UI hint.
- `word_list_items(list_id, word_id, rank)` – membership for curated lists.

Training and events:
- `training_scenarios(id, name_en, name_nl, description, card_modes, graduation_threshold, enabled, sort_order)` – user-facing scenario grouping over internal card modes.
- `user_word_status(user_id, word_id, mode, fsrs_*, next_review_at, last_seen_at, last_reviewed_at, click_count, seen_count, success_count, hidden, frozen_until, in_learning, learning_due_at)` – per-user, per-word, per-mode scheduling state.
- `user_review_log(id, user_id, word_id, mode, turn_id, grade, review_type, scheduled_at, reviewed_at, stability_before, difficulty_before, stability_after, difficulty_after, interval_after, params_version, metadata)` – review audit trail.
- `user_events(id, user_id, word_id, mode, event_type, created_at, meta)` – generic event log.

User features:
- `user_settings(user_id, daily_new_limit, daily_review_limit, target_retention, new_review_ratio, modes_enabled, card_filter, active_scenario, active_list_id, active_list_type, translation_lang, subscription_tier, training_sidebar_pinned, preferences, audio_quality, updated_at)` – preferences and account-tier state.
- `user_word_lists(id, user_id, language_code, primary_language_code, name, description, created_at, updated_at)` – user-created lists.
- `user_word_list_items(list_id, word_id, added_at)` – membership for user-created lists.
- `word_entry_translations(word_entry_id, target_lang, provider, status, overlay, note, source_fingerprint, error_message, created_at, updated_at)` – shared translation overlays and provider cache metadata.
- `user_word_notes(id, user_id, word_entry_id, notes, created_at, updated_at)` – per-user notes.

JSON Schemas:
- Language note templates live at `packages/shared/schemas/<lang>/note.schema.json` (see NL example).
- Card types defined at `packages/shared/card-types/card-types.json`.

Guidelines:
- Treat `word_entries.raw` as the current fidelity layer for dictionary-specific structure.
- Dictionary lookup/search/training RPCs must enforce `can_access_dictionary(...)`; ordinary lookup is read-only and must not mutate FSRS state.
- App routes that generate translation overlays may use server credentials for cache writes, but source entry reads must still go through authenticated gated entry RPCs.
- Do not design new work around the older aspirational `headwords`/`meanings`/`notes`/`user_progress` model unless you are explicitly planning a schema migration.
- For scheduler changes, update migrations and the FSRS tests in `apps/ui/tests/fsrs`.
