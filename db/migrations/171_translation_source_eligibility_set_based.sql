-- Evaluate source-word learning eligibility once per entry instead of once
-- for every example node that belongs to that entry.
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
  ), target_entries AS MATERIALIZED (
    SELECT source.entry_id AS target_entry_id,
           binding.dictionary_id,
           binding.identity_scheme_version,
           binding.source_group_key,
           source_group.id AS group_id
      FROM source_entries AS source
      JOIN public.word_entries AS entry
        ON entry.id = source.entry_id
      LEFT JOIN private.source_entry_bindings AS binding
        ON binding.word_entry_id = entry.id
       AND binding.binding_state = 'active'
      LEFT JOIN private.platform_v2_headword_groups AS source_group
        ON source_group.management_kind = 'source'
       AND source_group.dictionary_id = binding.dictionary_id
       AND source_group.identity_scheme_version = binding.identity_scheme_version
       AND source_group.source_group_key = binding.source_group_key
     WHERE entry.dictionary_id IS NULL
        OR public.can_access_dictionary(p_user_id, entry.dictionary_id, 'read')
  ), grouped_entries AS MATERIALIZED (
    SELECT target.target_entry_id,
           target.target_entry_id AS grouped_entry_id
      FROM target_entries AS target
     WHERE target.group_id IS NULL

    UNION ALL

    SELECT target.target_entry_id,
           sibling.word_entry_id AS grouped_entry_id
      FROM target_entries AS target
      JOIN private.source_entry_bindings AS sibling
        ON sibling.dictionary_id = target.dictionary_id
       AND sibling.identity_scheme_version = target.identity_scheme_version
       AND sibling.source_group_key = target.source_group_key
       AND sibling.binding_state = 'active'
     WHERE target.group_id IS NOT NULL
  ), eligible_entries AS MATERIALIZED (
    SELECT DISTINCT grouped.target_entry_id
      FROM grouped_entries AS grouped
      JOIN public.word_entries AS candidate
        ON candidate.id = grouped.grouped_entry_id
     WHERE (candidate.dictionary_id IS NULL
            OR public.can_access_dictionary(
              p_user_id, candidate.dictionary_id, 'read'
            ))
       AND (
         EXISTS (
           SELECT 1
             FROM public.user_card_status AS status
            WHERE status.user_id = p_user_id
              AND status.entry_id = grouped.grouped_entry_id
              AND status.card_type_id IN (
                'word-to-definition', 'definition-to-word'
              )
              AND (
                COALESCE(status.in_learning, false)
                OR COALESCE(status.fsrs_enabled, false)
                OR COALESCE(status.fsrs_reps, 0) > 0
                OR status.last_reviewed_at IS NOT NULL
              )
         )
         OR EXISTS (
           SELECT 1
             FROM public.user_card_known_marks AS known
            WHERE known.user_id = p_user_id
              AND known.entry_id = grouped.grouped_entry_id
              AND known.card_type_id IN (
                'word-to-definition', 'definition-to-word'
              )
              AND known.cleared_at IS NULL
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
        ON eligible.target_entry_id = node.entry_id
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
