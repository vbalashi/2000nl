-- Build the learned ordinary-meaning set once, then match source entries to
-- exact learned entries or learned source groups. Dictionary access is checked
-- once per distinct dictionary instead of once per candidate row.
BEGIN;

CREATE OR REPLACE FUNCTION private.training_translation_source_nodes_v1(
  p_user_id uuid,
  p_list_id uuid,
  p_list_type text,
  p_training_filter jsonb
)
RETURNS TABLE (
  content_node_id uuid,
  entry_id uuid,
  source_path text,
  source_text_fingerprint text,
  created_at timestamptz,
  source_revision text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $function$
  WITH source_entries AS MATERIALIZED (
    SELECT entry_id
      FROM private.training_extra_source_entries_v1(
        p_user_id, p_list_id, p_list_type, p_training_filter
      )
  ), learned_entries AS MATERIALIZED (
    SELECT DISTINCT state.entry_id
      FROM (
        SELECT status.entry_id
          FROM public.user_card_status AS status
         WHERE status.user_id = p_user_id
           AND status.card_type_id IN (
             'word-to-definition', 'definition-to-word'
           )
           AND (
             COALESCE(status.in_learning, false)
             OR COALESCE(status.fsrs_enabled, false)
             OR COALESCE(status.fsrs_reps, 0) > 0
             OR status.last_reviewed_at IS NOT NULL
           )
        UNION ALL
        SELECT known.entry_id
          FROM public.user_card_known_marks AS known
         WHERE known.user_id = p_user_id
           AND known.card_type_id IN (
             'word-to-definition', 'definition-to-word'
           )
           AND known.cleared_at IS NULL
      ) AS state
  ), source_context AS MATERIALIZED (
    SELECT source.entry_id,
           entry.dictionary_id,
           binding.dictionary_id AS binding_dictionary_id,
           binding.identity_scheme_version,
           binding.source_group_key
      FROM source_entries AS source
      JOIN public.word_entries AS entry
        ON entry.id = source.entry_id
      LEFT JOIN private.source_entry_bindings AS binding
        ON binding.word_entry_id = entry.id
       AND binding.binding_state = 'active'
  ), learned_context AS MATERIALIZED (
    SELECT learned.entry_id,
           entry.dictionary_id,
           binding.dictionary_id AS binding_dictionary_id,
           binding.identity_scheme_version,
           binding.source_group_key
      FROM learned_entries AS learned
      JOIN public.word_entries AS entry
        ON entry.id = learned.entry_id
      LEFT JOIN private.source_entry_bindings AS binding
        ON binding.word_entry_id = entry.id
       AND binding.binding_state = 'active'
  ), dictionary_ids AS MATERIALIZED (
    SELECT dictionary_id
      FROM source_context
     WHERE dictionary_id IS NOT NULL
    UNION
    SELECT dictionary_id
      FROM learned_context
     WHERE dictionary_id IS NOT NULL
  ), dictionary_access AS MATERIALIZED (
    SELECT dictionary_id,
           public.can_access_dictionary(
             p_user_id, dictionary_id, 'read'
           ) AS can_read
      FROM dictionary_ids
  ), accessible_learned AS MATERIALIZED (
    SELECT learned.*
      FROM learned_context AS learned
     WHERE learned.dictionary_id IS NULL
        OR EXISTS (
          SELECT 1
            FROM dictionary_access AS access
           WHERE access.dictionary_id = learned.dictionary_id
             AND access.can_read
        )
  ), eligible_groups AS MATERIALIZED (
    SELECT DISTINCT source_group.dictionary_id,
           source_group.identity_scheme_version,
           source_group.source_group_key
      FROM private.platform_v2_headword_groups AS source_group
      JOIN accessible_learned AS learned
        ON learned.binding_dictionary_id = source_group.dictionary_id
       AND learned.identity_scheme_version = source_group.identity_scheme_version
       AND learned.source_group_key = source_group.source_group_key
     WHERE source_group.management_kind = 'source'
  ), eligible_entries AS MATERIALIZED (
    SELECT source.entry_id
      FROM source_context AS source
     WHERE (
       source.dictionary_id IS NULL
       OR EXISTS (
         SELECT 1
           FROM dictionary_access AS access
          WHERE access.dictionary_id = source.dictionary_id
            AND access.can_read
       )
     )
       AND (
         EXISTS (
           SELECT 1
             FROM accessible_learned AS learned
            WHERE learned.entry_id = source.entry_id
         )
         OR EXISTS (
           SELECT 1
             FROM eligible_groups AS source_group
            WHERE source_group.dictionary_id = source.binding_dictionary_id
              AND source_group.identity_scheme_version = source.identity_scheme_version
              AND source_group.source_group_key = source.source_group_key
         )
       )
  ), source_nodes AS (
    SELECT node.id AS content_node_id,
           node.entry_id,
           node.diagnostic_locator AS source_path,
           node.source_text_fingerprint,
           node.created_at,
           encode(digest(
             node.id::text || ':' || node.source_text_fingerprint,
             'sha256'
           ), 'hex') AS source_revision
      FROM private.platform_v2_content_nodes AS node
      JOIN eligible_entries AS eligible
        ON eligible.entry_id = node.entry_id
     WHERE node.kind = 'example'
       AND node.binding_state = 'active'
       AND NULLIF(btrim(node.diagnostic_locator), '') IS NOT NULL
       AND node.diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$'
       AND NOT EXISTS (
         SELECT 1
           FROM private.platform_v2_training_exercise_targets AS stale
          WHERE stale.entry_id = node.entry_id
            AND stale.content_node_id = node.id
            AND stale.family = 'translation'
            AND stale.direction = 'recall'
            AND stale.source_text_fingerprint
                  IS DISTINCT FROM node.source_text_fingerprint
       )
  )
  SELECT * FROM source_nodes;
$function$;

ALTER FUNCTION private.training_translation_source_nodes_v1(uuid, uuid, text, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_translation_source_nodes_v1(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
