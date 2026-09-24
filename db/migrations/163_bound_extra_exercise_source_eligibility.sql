-- Keep the existing extra-exercise source gate, but resolve only the target's
-- active headword group. The previous function called the group resolver on
-- every word entry for each session member or target read.
BEGIN;

CREATE OR REPLACE FUNCTION private.platform_v2_training_ordinary_meaning_eligible_v1(
    p_user_id uuid,
    p_entry_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    WITH target_entry AS MATERIALIZED (
        SELECT entry.id
          FROM public.word_entries AS entry
         WHERE entry.id = p_entry_id
           AND (
               entry.dictionary_id IS NULL
               OR public.can_access_dictionary(
                   p_user_id, entry.dictionary_id, 'read'
               )
           )
    ), target_source_group AS MATERIALIZED (
        SELECT target.id AS target_entry_id,
               source_group.id AS group_id,
               source_group.dictionary_id,
               source_group.identity_scheme_version,
               source_group.source_group_key
          FROM target_entry AS target
          LEFT JOIN private.source_entry_bindings AS binding
            ON binding.word_entry_id = target.id
           AND binding.binding_state = 'active'
          LEFT JOIN private.platform_v2_headword_groups AS source_group
            ON source_group.management_kind = 'source'
           AND source_group.dictionary_id = binding.dictionary_id
           AND source_group.identity_scheme_version =
               binding.identity_scheme_version
           AND source_group.source_group_key = binding.source_group_key
    ), grouped_entries AS (
        -- Unbound and user-owned entries have no source siblings. A user
        -- headword group is a singleton, so the direct entry is equivalent.
        SELECT target.target_entry_id AS id
          FROM target_source_group AS target
         WHERE target.group_id IS NULL

        UNION ALL

        SELECT sibling.word_entry_id AS id
          FROM target_source_group AS target
          JOIN private.source_entry_bindings AS sibling
            ON sibling.dictionary_id = target.dictionary_id
           AND sibling.identity_scheme_version =
               target.identity_scheme_version
           AND sibling.source_group_key = target.source_group_key
           AND sibling.binding_state = 'active'
         WHERE target.group_id IS NOT NULL
    )
    SELECT EXISTS (
        SELECT 1
          FROM grouped_entries AS grouped
          JOIN public.word_entries AS entry ON entry.id = grouped.id
         WHERE (
             entry.dictionary_id IS NULL
             OR public.can_access_dictionary(
                 p_user_id, entry.dictionary_id, 'read'
             )
         )
           AND (
               EXISTS (
                   SELECT 1
                     FROM public.user_card_status AS status
                    WHERE status.user_id = p_user_id
                      AND status.entry_id = grouped.id
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
                      AND known.entry_id = grouped.id
                      AND known.card_type_id IN (
                          'word-to-definition', 'definition-to-word'
                      )
                      AND known.cleared_at IS NULL
               )
           )
    );
$$;

ALTER FUNCTION private.platform_v2_training_ordinary_meaning_eligible_v1(uuid, uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION private.platform_v2_training_ordinary_meaning_eligible_v1(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
