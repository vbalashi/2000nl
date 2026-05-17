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
