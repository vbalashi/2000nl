-- Fresh application install only; use retaining forward migrations for upgrades.
\set ON_ERROR_STOP on
\i db/migrations/287_initial_schema.sql
\i db/migrations/288_meaning_sibling_spacing.sql
\i db/migrations/289_training_card_count_preference.sql
\i db/migrations/290_grouped_word_search_fuzzy.sql
\i db/migrations/291_library_category_search_scope.sql
\i db/migrations/292_library_abbreviation_prefix_filters.sql
\i db/migrations/293_vocabulary_selection.sql
\i db/migrations/294_library_search_unfiltered_scope_fast_path.sql
\i db/migrations/295_editable_release_notes.sql
\i db/migrations/296_training_vocabulary_batch_selection.sql
\i db/migrations/297_library_batch_selection.sql
\i db/migrations/298_library_meaning_count.sql
\i db/migrations/299_written_pos_order.sql
\i db/migrations/300_training_availability_totals.sql
\i db/migrations/301_vocabulary_meaning_limits.sql
\i db/migrations/302_new_learner_starter_training.sql
