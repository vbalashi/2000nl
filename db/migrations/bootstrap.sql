-- Fresh application install only; use retaining forward migrations for upgrades.
\set ON_ERROR_STOP on
\i db/migrations/287_initial_schema.sql
\i db/migrations/288_meaning_sibling_spacing.sql
