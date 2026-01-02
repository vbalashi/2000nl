-- Bootstrap: Apply all migrations in order for a fresh deploy.
-- Generated: 2025-12-31
--
-- Run from repo root:
--   PGPASSWORD=... psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql

\set ON_ERROR_STOP on

-- =============================================================================
-- CONSOLIDATED BASELINE (captures schema state as of 2025-12-31)
-- =============================================================================

-- Core schema: tables, indexes, extensions
\i db/migrations/001_core_schema.sql

-- FSRS-6 engine: algorithm and review handlers
\i db/migrations/002_fsrs_engine.sql

-- Queue & training: card selection, statistics
\i db/migrations/003_queue_training.sql

-- User features: settings, lists, translations, notes
\i db/migrations/004_user_features.sql

-- Security: RLS policies
\i db/migrations/005_security.sql

-- =============================================================================
-- DELTA MIGRATIONS (new features after consolidation)
-- =============================================================================

-- Subscription tiers with gated word access
\i db/migrations/0038_subscription_tier.sql

-- VanDale (full) word list
\i db/migrations/0039_add_vandale_all_list.sql
