-- Bootstrap: Apply all migrations in order for a fresh deploy.
-- Generated: 2026-02-09
--
-- Run from repo root:
--   PGPASSWORD=... psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql

\set ON_ERROR_STOP on

-- =============================================================================
-- CONSOLIDATED SCHEMA (captures full state as of 2026-02-09)
-- =============================================================================

-- Core schema: tables, indexes, extensions, curated lists
\i db/migrations/001_core_schema.sql

-- FSRS-6 engine: algorithm and review handlers
\i db/migrations/002_fsrs_engine.sql

-- Queue & training: card selection, statistics
\i db/migrations/003_queue_training.sql

-- User features: settings, lists, translations, notes, subscription tiers
\i db/migrations/004_user_features.sql

-- Security: RLS policies
\i db/migrations/005_security.sql

-- Data fixes
\i db/migrations/006_fix_omgekeerd_translation_ru.sql

-- Review idempotency: turn IDs and temporal guardrails
\i db/migrations/007_review_idempotency.sql

-- Dictionary boundary: schema registry, seeded VanDale dictionary, and compatibility metadata
\i db/migrations/008_dictionary_boundary.sql

-- Dictionary-scoped identity: allow duplicate headwords/meanings across dictionaries
\i db/migrations/009_drop_legacy_word_entry_uniqueness.sql

-- Dictionary-scoped read metadata for training payloads
\i db/migrations/010_scope_meanings_count_by_dictionary.sql

-- Explicit RPC for training view tracking
\i db/migrations/011_record_word_view_rpc.sql

-- Dictionary metadata for word form lookups/imports
\i db/migrations/012_scope_word_forms_by_dictionary.sql

-- Enforce dictionary read access in gated word entry RPCs
\i db/migrations/013_filter_gated_word_reads_by_dictionary.sql

-- Exclude reviewed cards by entry+mode during a training session
\i db/migrations/014_exclude_training_cards_by_identity.sql

-- Read-only dictionary lookup behind dictionary access checks
\i db/migrations/015_gated_dictionary_lookup.sql

-- Enforce dictionary read access in training scheduler selection
\i db/migrations/016_scope_scheduler_by_dictionary_access.sql

-- Explicit start-learning action without review-log side effects
\i db/migrations/017_start_learning_card_action.sql

-- Explicit user-list membership action with ownership and dictionary access checks
\i db/migrations/018_add_entry_to_user_list_action.sql

-- User-owned dictionary schema and private editable dictionary container
\i db/migrations/019_user_entry_schema_boundary.sql

-- Explicit copy action from readable entries into user-owned dictionaries
\i db/migrations/020_copy_entry_to_user_dictionary_action.sql

-- Return all accessible candidates from dictionary lookup
\i db/migrations/021_lookup_multiple_dictionary_candidates.sql

-- Refine copied user-entry payloads for training-safe content
\i db/migrations/022_refine_user_dictionary_copy_payload.sql

-- Explicit CRUD actions for user-entry-v1 entries
\i db/migrations/023_user_dictionary_entry_crud_actions.sql

-- Explicit user-list membership removal action
\i db/migrations/024_remove_entries_from_user_list_action.sql

-- Explicit user word-list CRUD actions
\i db/migrations/025_user_word_list_crud_actions.sql
