# Data Model

Canonical tables live in `db/migrations/001_core_schema.sql` and `db/migrations/004_user_features.sql`.

Content and lists:
- `languages(code, name)` – language catalog.
- `word_entries(id, language_code, headword, part_of_speech, gender, is_nt2_2000, vandale_id, raw, created_at)` – dictionary entries. The rich dictionary shape is currently retained in `raw` JSONB.
- `word_forms(language_code, form, word_id, headword, created_at)` – inflection/conjugation lookup rows.
- `word_lists(id, language_code, slug, name, description, is_primary, sort_order)` – curated/system word lists such as `vandale-all` and `nt2-2000`.
- `word_list_items(list_id, word_id, rank)` – membership for curated lists.

Training and events:
- `training_scenarios(id, name_en, name_nl, description, card_modes, graduation_threshold, enabled, sort_order)` – user-facing scenario grouping over internal card modes.
- `user_word_status(user_id, word_id, mode, fsrs_*, next_review_at, last_seen_at, last_reviewed_at, click_count, seen_count, success_count, hidden, frozen_until, in_learning, learning_due_at)` – per-user, per-word, per-mode scheduling state.
- `user_review_log(id, user_id, word_id, mode, turn_id, grade, review_type, scheduled_at, reviewed_at, stability_before, difficulty_before, stability_after, difficulty_after, interval_after, params_version, metadata)` – review audit trail.
- `user_events(id, user_id, word_id, mode, event_type, created_at, meta)` – generic event log.

User features:
- `user_settings(user_id, daily_new_limit, daily_review_limit, target_retention, new_review_ratio, modes_enabled, card_filter, active_scenario, active_list_id, active_list_type, translation_lang, subscription_tier, training_sidebar_pinned, preferences, audio_quality, updated_at)` – preferences and account-tier state.
- `user_word_lists(id, user_id, language_code, name, description, created_at, updated_at)` – user-created lists.
- `user_word_list_items(list_id, word_id, added_at)` – membership for user-created lists.
- `word_entry_translations(word_entry_id, target_lang, provider, status, overlay, note, source_fingerprint, error_message, created_at, updated_at)` – shared translation overlays and provider cache metadata.
- `user_word_notes(id, user_id, word_entry_id, notes, created_at, updated_at)` – per-user notes.

JSON Schemas:
- Language note templates live at `packages/shared/schemas/<lang>/note.schema.json` (see NL example).
- Card types defined at `packages/shared/card-types/card-types.json`.

Guidelines:
- Treat `word_entries.raw` as the current fidelity layer for dictionary-specific structure.
- Do not design new work around the older aspirational `headwords`/`meanings`/`notes`/`user_progress` model unless you are explicitly planning a schema migration.
- For scheduler changes, update migrations and the FSRS tests in `apps/ui/tests/fsrs`.
