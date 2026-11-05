-- Fresh application install only; use retaining forward migrations for upgrades.
\set ON_ERROR_STOP on
\i db/migrations/287_initial_schema.sql
\i db/migrations/288_meaning_sibling_spacing.sql
\i db/migrations/289_training_card_count_preference.sql
\i db/migrations/290_grouped_word_search_fuzzy.sql
\i db/migrations/291_library_category_search_scope.sql
