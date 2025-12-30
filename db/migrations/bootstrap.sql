-- Apply all migrations in order for a fresh deploy.
-- Run from repo root:
--   PGPASSWORD=... psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/bootstrap.sql

\set ON_ERROR_STOP on

\i migrations/0001_create_schema.sql
\i migrations/0002_rename_frequency_rank.sql
\i migrations/0003_add_user_tracking.sql
\i migrations/0004_sm2_functions.sql
\i migrations/0005_stats_functions.sql
\i migrations/0006_word_forms.sql
\i migrations/0007_add_meaning_id.sql
\i migrations/0008_enable_rls.sql
\i migrations/0009_set_search_path.sql
