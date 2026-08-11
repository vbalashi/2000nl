-- Deterministic, access-gated Platform V2 training lookup by scheduled entry.

BEGIN;

CREATE OR REPLACE FUNCTION public.read_platform_v2_training_group(
    p_user_id uuid,
    p_entry_id uuid,
    p_group_entry_bound integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_group_entry_bound integer :=
        LEAST(GREATEST(COALESCE(p_group_entry_bound, 50), 1), 100);
    v_group_id uuid;
    v_entry_count integer;
    v_items jsonb;
BEGIN
    IF p_user_id IS NULL OR p_entry_id IS NULL THEN
        RETURN jsonb_build_object('error', 'entry_not_accessible');
    END IF;

    SELECT COALESCE(source_group.id, user_group.id)
    INTO v_group_id
    FROM public.word_entries AS entry
    JOIN public.dictionaries AS dictionary
      ON dictionary.id = entry.dictionary_id
    LEFT JOIN private.source_entry_bindings AS binding
      ON binding.word_entry_id = entry.id
     AND binding.binding_state = 'active'
    LEFT JOIN private.platform_v2_headword_groups AS source_group
      ON source_group.management_kind = 'source'
     AND source_group.dictionary_id = binding.dictionary_id
     AND source_group.identity_scheme_version = binding.identity_scheme_version
     AND source_group.source_group_key = binding.source_group_key
    LEFT JOIN private.platform_v2_headword_groups AS user_group
      ON user_group.management_kind = 'user'
     AND user_group.singleton_entry_id = entry.id
    WHERE entry.id = p_entry_id
      AND (
          (
              dictionary.kind = 'user'
              AND dictionary.owner_user_id = p_user_id
          )
          OR (
              dictionary.kind <> 'user'
              AND public.can_access_dictionary(
                  p_user_id,
                  dictionary.id,
                  'read'
              )
          )
      );

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'entry_not_accessible');
    END IF;
    IF v_group_id IS NULL THEN
        RETURN jsonb_build_object(
            'error',
            'presentation_identity_incomplete'
        );
    END IF;

    WITH group_members AS MATERIALIZED (
        SELECT
            entry.*,
            dictionary AS dictionary_record,
            binding.sense_ordinal AS presentation_ordinal
        FROM private.platform_v2_headword_groups AS headword_group
        JOIN private.source_entry_bindings AS binding
          ON headword_group.management_kind = 'source'
         AND binding.binding_state = 'active'
         AND binding.dictionary_id = headword_group.dictionary_id
         AND binding.identity_scheme_version =
             headword_group.identity_scheme_version
         AND binding.source_group_key = headword_group.source_group_key
        JOIN public.word_entries AS entry
          ON entry.id = binding.word_entry_id
        JOIN public.dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id
        WHERE headword_group.id = v_group_id

        UNION ALL

        SELECT
            entry.*,
            dictionary AS dictionary_record,
            entry.meaning_id AS presentation_ordinal
        FROM private.platform_v2_headword_groups AS headword_group
        JOIN public.word_entries AS entry
          ON headword_group.management_kind = 'user'
         AND entry.id = headword_group.singleton_entry_id
        JOIN public.dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id
        WHERE headword_group.id = v_group_id
    )
    SELECT
        count(*),
        jsonb_agg(
            to_jsonb(group_members)
                - 'dictionary_record'
                - 'presentation_ordinal'
                || jsonb_build_object(
                    'dictionary',
                    to_jsonb(group_members.dictionary_record)
                )
            ORDER BY group_members.presentation_ordinal, group_members.id
        )
    INTO v_entry_count, v_items
    FROM group_members;

    IF v_entry_count = 0
       OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(v_items, '[]'::jsonb)) AS item
           WHERE item->>'id' = p_entry_id::text
       ) THEN
        RETURN jsonb_build_object(
            'error',
            'presentation_identity_incomplete'
        );
    END IF;
    IF v_entry_count > v_group_entry_bound THEN
        RETURN jsonb_build_object(
            'error',
            'group-too-large',
            'entryCount',
            v_entry_count,
            'entryBound',
            v_group_entry_bound
        );
    END IF;

    RETURN jsonb_build_object(
        'items',
        v_items,
        'page',
        jsonb_build_object(
            'selectedTierComplete',
            true,
            'nextGroupCursor',
            NULL
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.read_platform_v2_training_group(
    uuid,
    uuid,
    integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_platform_v2_training_group(
    uuid,
    uuid,
    integer
) TO service_role;

COMMIT;
