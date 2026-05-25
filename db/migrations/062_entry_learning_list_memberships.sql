-- Return real learning-list memberships for dictionary entries.
--
-- Dictionary source lists, such as the full VanDale source container, are
-- intentionally excluded. Curated learning lists are read-only memberships;
-- user-owned lists are editable memberships.

CREATE OR REPLACE FUNCTION public.get_user_list_memberships_for_entries(
    p_user_id uuid,
    p_entry_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    WITH requested(entry_id) AS (
        SELECT DISTINCT unnest(COALESCE(p_entry_ids, ARRAY[]::uuid[]))
    ),
    accessible_requested AS (
        SELECT requested.entry_id
        FROM requested
        JOIN word_entries entry ON entry.id = requested.entry_id
        WHERE entry.dictionary_id IS NULL
           OR can_access_dictionary(p_user_id, entry.dictionary_id, 'read')
    ),
    active_training_list AS (
        SELECT active_list_id, active_list_type
        FROM user_settings
        WHERE user_id = p_user_id
    ),
    curated_memberships AS (
        SELECT
            item.word_id AS entry_id,
            jsonb_build_object(
                'id', list.id,
                'kind', 'curated',
                'name', list.name,
                'description', list.description,
                'primary_language_code', list.primary_language_code,
                'item_count', (
                    SELECT COUNT(*)::int
                    FROM word_list_items count_item
                    WHERE count_item.list_id = list.id
                ),
                'editable', false,
                'read_only_reason', 'curated',
                'is_active_training_list',
                    COALESCE(active.active_list_type = 'curated'
                        AND active.active_list_id = list.id, false)
            ) AS list_payload
        FROM accessible_requested
        JOIN word_list_items item ON item.word_id = accessible_requested.entry_id
        JOIN word_lists list ON list.id = item.list_id
        LEFT JOIN active_training_list active ON true
        WHERE COALESCE(list.slug, '') <> 'vandale-all'
          AND lower(btrim(list.name)) <> 'vandale'
    ),
    user_memberships AS (
        SELECT
            item.word_id AS entry_id,
            jsonb_build_object(
                'id', list.id,
                'kind', 'user',
                'name', list.name,
                'description', list.description,
                'primary_language_code', list.primary_language_code,
                'item_count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items count_item
                    WHERE count_item.list_id = list.id
                ),
                'editable', true,
                'read_only_reason', null,
                'is_active_training_list',
                    COALESCE(active.active_list_type = 'user'
                        AND active.active_list_id = list.id, false)
            ) AS list_payload
        FROM accessible_requested
        JOIN user_word_list_items item ON item.word_id = accessible_requested.entry_id
        JOIN user_word_lists list ON list.id = item.list_id
        LEFT JOIN active_training_list active ON true
        WHERE list.user_id = p_user_id
    ),
    memberships AS (
        SELECT entry_id, list_payload FROM curated_memberships
        UNION ALL
        SELECT entry_id, list_payload FROM user_memberships
    ),
    grouped AS (
        SELECT
            entry_id,
            jsonb_agg(
                list_payload
                ORDER BY list_payload->>'kind', list_payload->>'name'
            ) AS lists
        FROM memberships
        GROUP BY entry_id
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'entry_id', entry_id,
                'lists', lists
            )
            ORDER BY entry_id
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM grouped;

    RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_list_memberships_for_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_list_memberships_for_entries(uuid, uuid[]) TO authenticated;
