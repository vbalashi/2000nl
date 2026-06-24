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

-- Gated dictionary entry lookup by id
\i db/migrations/026_gated_dictionary_entry_by_id.sql

-- Explicit user word-list metadata update action
\i db/migrations/027_update_user_word_list_action.sql

-- Recent training history read RPC
\i db/migrations/028_recent_training_history_rpc.sql

-- Card user-state read RPC
\i db/migrations/029_card_user_state_rpc.sql

-- Extended card user-state payload for platform API
\i db/migrations/030_extend_card_user_state_rpc.sql

-- Owned user-list membership read RPC
\i db/migrations/031_user_list_membership_rpc.sql

-- Word-list summary read RPC
\i db/migrations/032_word_list_summary_rpc.sql

-- Available word-lists read RPC
\i db/migrations/033_available_word_lists_rpc.sql

-- Active word-list preference RPCs
\i db/migrations/034_active_word_list_rpcs.sql

-- Learning preference RPCs
\i db/migrations/035_learning_preferences_rpcs.sql

-- Dictionary metadata in lookup candidates
\i db/migrations/036_lookup_dictionary_metadata.sql

-- User-list memberships for platform lookup/status payloads
\i db/migrations/037_user_list_memberships_for_entries_rpc.sql

-- Card-oriented compatibility boundary over user_word_status
\i db/migrations/038_card_state_compatibility_boundary.sql

-- Card-oriented scheduler compatibility wrapper
\i db/migrations/039_get_next_card_compatibility_rpc.sql

-- Training intent metadata for lists
\i db/migrations/040_list_training_intent.sql

-- Explicit clear semantics for list training intent updates
\i db/migrations/041_clear_list_training_intent.sql

-- Physical card-state storage with legacy sync
\i db/migrations/042_physical_user_card_status.sql

-- Card-facing RPCs backed by physical card-state storage
\i db/migrations/043_use_physical_card_status_rpcs.sql

-- Recent history backed by physical card-state storage
\i db/migrations/044_use_physical_card_status_history.sql

-- Card-facing reviews backed by physical card-state storage
\i db/migrations/045_handle_card_review_on_card_status.sql

-- Scheduler selection backed by physical card-state storage
\i db/migrations/046_scheduler_uses_card_status.sql

-- Legacy-named write RPCs backed by physical card-state storage
\i db/migrations/047_legacy_write_rpcs_use_card_status.sql

-- Training stats backed by physical card-state storage
\i db/migrations/048_stats_use_card_status.sql

-- Dictionary lookup status backed by physical card-state storage
\i db/migrations/049_lookup_uses_card_status.sql

-- Gated word reads backed by physical card-state storage
\i db/migrations/050_gated_word_reads_use_card_status.sql

-- Remove legacy word-status sync bridge
\i db/migrations/051_remove_word_status_sync_bridge.sql

-- Drop legacy word-oriented state storage
\i db/migrations/052_drop_legacy_user_word_status.sql

-- Make get_next_card the primary scheduler RPC
\i db/migrations/053_get_next_card_primary.sql

-- Drop legacy word-named training mutation RPCs
\i db/migrations/054_drop_legacy_word_rpcs.sql

-- Extend card-state lookup payloads
\i db/migrations/055_extend_card_state_payload.sql

-- Rename platform-facing RPC parameters to entry terminology
\i db/migrations/056_entry_named_platform_rpc_params.sql

-- Rename user-list membership RPC parameters to entry terminology
\i db/migrations/057_entry_named_membership_rpc_params.sql

-- Rename optional review debug parameter to entry terminology
\i db/migrations/058_entry_named_review_debug_param.sql

-- Harden user-scoped RPC auth guards, search paths, and execute grants
\i db/migrations/059_security_harden_user_scoped_rpcs.sql

-- Filter stats by dictionary visibility
\i db/migrations/060_stats_filter_dictionary_access.sql

-- Bulk user card state lookup for platform APIs
\i db/migrations/061_bulk_user_card_states.sql

-- Curated and user learning-list memberships for entry detail
\i db/migrations/062_entry_learning_list_memberships.sql

-- Ranked dictionary search metadata for lookup UI
\i db/migrations/063_ranked_word_entry_search.sql

-- Multilanguage language/source APIs and per-language training scopes
\i db/migrations/064_multilanguage_scope_rpcs.sql

-- Single-entry fetch source metadata for user dictionary UI
\i db/migrations/065_fetch_entry_by_id_dictionary_metadata.sql

-- Harden live-migration security and read-only scope blockers
\i db/migrations/066_harden_live_migration_blockers.sql

-- Remove remaining legacy scheduler overloads found in live postflight
\i db/migrations/067_drop_remaining_legacy_get_next_word.sql

-- Optimize production dictionary search path after live post-migration QA
\i db/migrations/068_optimize_gated_dictionary_search.sql

-- Prefer exact-case lookup matches when ranked search candidates tie
\i db/migrations/069_search_exact_case_tiebreak.sql

-- 2000NL Connect registered clients, grants, codes, and sessions
\i db/migrations/070_connected_clients.sql

-- Extracted dictionary search documents and field fragments
\i db/migrations/071_dictionary_search_documents.sql

-- Versioned dictionary search and exact lookup over extracted search documents
\i db/migrations/072_dictionary_search_v2_rpcs.sql

-- Platform generic text translation artifacts for external clients
\i db/migrations/073_platform_text_translations.sql

-- Guest-safe public catalog search for external clients
\i db/migrations/074_public_catalog_search.sql

-- Align generic text translation lookup index with context-aware identity
\i db/migrations/075_platform_text_translations_context_lookup_idx.sql

-- Ensure explicit start-learning moves cards into the learning phase
\i db/migrations/076_start_learning_sets_in_learning.sql

-- Source/provenance-aware external card actions
\i db/migrations/077_external_card_action_provenance.sql

-- Scope connected-client session/action attribution
\i db/migrations/078_platform_principal_connected_client_scope.sql

-- Source-context-v2 artifact provenance
\i db/migrations/079_source_context_v2_artifacts.sql

-- Source-context-v2 review turn idempotency guard
\i db/migrations/080_source_context_v2_review_exactly_once.sql

-- Source-context-v2 semantic idempotency payloads
\i db/migrations/081_source_context_v2_semantic_idempotency.sql

-- Source-context-v2 canonical source normalization
\i db/migrations/082_source_context_v2_source_canonicalization.sql

-- Source-context-v2 private source normalization
\i db/migrations/083_source_context_v2_private_sources.sql

-- Diacritic-insensitive platform dictionary lookup
\i db/migrations/084_diacritic_insensitive_platform_lookup.sql

-- Generated user dictionary entry metadata contract
\i db/migrations/085_generated_user_entry_contract.sql
\i db/migrations/086_training_source_filters.sql

-- Stable dictionary search field identity for grouped search
\i db/migrations/087_dictionary_search_field_identity.sql

-- Strict clicked-word dictionary lookup RPCs
\i db/migrations/088_strict_dictionary_lookup_rpcs.sql

-- Resumable dictionary search document backfill runs
\i db/migrations/089_dictionary_search_backfill_runs.sql

-- Grouped dictionary discovery search RPCs
\i db/migrations/090_dictionary_grouped_search_rpcs.sql

-- Clean grouped search empty item arrays
\i db/migrations/091_clean_grouped_search_empty_items.sql

-- Keep generated user-entry validation helper internal
\i db/migrations/092_harden_generated_user_entry_helper.sql

-- Indexed public catalog clicked-word lookup
\i db/migrations/093_indexed_public_catalog_lookup.sql

-- Keyset-first alphabetical grouped search
\i db/migrations/094_alphabetical_keyset_search.sql

-- Bounded grouped-search readiness checks
\i db/migrations/095_grouped_search_readiness_exists.sql

-- Bounded headword/body grouped search
\i db/migrations/096_grouped_search_bounded_headwords_body.sql

-- Bounded body-group branch pages
\i db/migrations/097_bounded_body_group_branch_pages.sql

-- Body-group page-order indexes
\i db/migrations/098_body_group_page_order_indexes.sql
