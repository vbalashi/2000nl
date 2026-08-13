-- Keep source cross-reference records out of every Training scheduler path.
--
-- Platform V2 intentionally projects these records for Library navigation, but
-- they have no learnable meaning and therefore cannot own a training card. The
-- public wrappers add their small, indexed ID set to the caller exclusions so
-- both the ordinary and filtered schedulers share one policy boundary.

BEGIN;

CREATE OR REPLACE FUNCTION private.is_pointer_only_dictionary_entry(
    p_raw jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT COALESCE(
        NULLIF(BTRIM(p_raw ->> 'cross_reference'), '') IS NOT NULL
        AND CASE
            WHEN jsonb_typeof(p_raw -> 'meanings') = 'array'
                THEN jsonb_array_length(p_raw -> 'meanings') = 0
            ELSE true
        END,
        false
    );
$$;

REVOKE ALL ON FUNCTION private.is_pointer_only_dictionary_entry(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS word_entries_pointer_only_scheduler_exclusion_idx
ON public.word_entries (id)
WHERE private.is_pointer_only_dictionary_entry(raw);

CREATE OR REPLACE FUNCTION private.pointer_only_dictionary_entry_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
    SELECT COALESCE(array_agg(entry.id), ARRAY[]::uuid[])
    FROM public.word_entries AS entry
    WHERE private.is_pointer_only_dictionary_entry(entry.raw);
$$;

REVOKE ALL ON FUNCTION private.pointer_only_dictionary_entry_ids()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_next_card(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'::text],
    p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL::uuid,
    p_list_type text DEFAULT 'curated'::text,
    p_card_filter text DEFAULT 'both'::text,
    p_queue_turn text DEFAULT 'auto'::text,
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_card_type_ids text[] := CASE
        WHEN p_card_type_ids IS NULL
          OR array_length(p_card_type_ids, 1) IS NULL
            THEN ARRAY['word-to-definition'::text]
        ELSE p_card_type_ids
    END;
    v_known_card_keys text[];
    v_pointer_only_entry_ids uuid[] :=
        private.pointer_only_dictionary_entry_ids();
BEGIN
    SELECT COALESCE(
        array_agg(k.entry_id::text || ':' || k.card_type_id),
        ARRAY[]::text[]
    )
      INTO v_known_card_keys
      FROM public.user_card_known_marks k
     WHERE k.user_id = p_user_id
       AND k.card_type_id = ANY(v_card_type_ids)
       AND k.cleared_at IS NULL;

    RETURN QUERY
    SELECT *
      FROM public.get_next_card_without_known(
          p_user_id,
          v_card_type_ids,
          COALESCE(p_exclude_entry_ids, ARRAY[]::uuid[])
              || v_pointer_only_entry_ids,
          p_list_id,
          p_list_type,
          p_card_filter,
          p_queue_turn,
          COALESCE(p_exclude_card_keys, ARRAY[]::text[])
              || v_known_card_keys
      );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_next_filtered_card(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'::text],
    p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL::uuid,
    p_list_type text DEFAULT 'curated'::text,
    p_card_filter text DEFAULT 'both'::text,
    p_queue_turn text DEFAULT 'auto'::text,
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[],
    p_training_filter jsonb DEFAULT '{}'::jsonb
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_card_type_ids text[] := CASE
        WHEN p_card_type_ids IS NULL
          OR array_length(p_card_type_ids, 1) IS NULL
            THEN ARRAY['word-to-definition'::text]
        ELSE p_card_type_ids
    END;
    v_known_card_keys text[];
    v_pointer_only_entry_ids uuid[] :=
        private.pointer_only_dictionary_entry_ids();
BEGIN
    SELECT COALESCE(
        array_agg(k.entry_id::text || ':' || k.card_type_id),
        ARRAY[]::text[]
    )
      INTO v_known_card_keys
      FROM public.user_card_known_marks k
     WHERE k.user_id = p_user_id
       AND k.card_type_id = ANY(v_card_type_ids)
       AND k.cleared_at IS NULL;

    RETURN QUERY
    SELECT *
      FROM public.get_next_filtered_card_without_known(
          p_user_id,
          v_card_type_ids,
          COALESCE(p_exclude_entry_ids, ARRAY[]::uuid[])
              || v_pointer_only_entry_ids,
          p_list_id,
          p_list_type,
          p_card_filter,
          p_queue_turn,
          COALESCE(p_exclude_card_keys, ARRAY[]::text[])
              || v_known_card_keys,
          p_training_filter
      );
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_card(
    uuid, text[], uuid[], uuid, text, text, text, text[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_card(
    uuid, text[], uuid[], uuid, text, text, text, text[]
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_next_filtered_card(
    uuid, text[], uuid[], uuid, text, text, text, text[], jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(
    uuid, text[], uuid[], uuid, text, text, text, text[], jsonb
) TO authenticated;

COMMIT;
