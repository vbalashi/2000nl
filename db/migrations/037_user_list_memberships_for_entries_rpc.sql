-- Return owned user-list memberships for a batch of dictionary entries.

DROP FUNCTION IF EXISTS get_user_list_memberships_for_entries(uuid, uuid[]);

CREATE OR REPLACE FUNCTION get_user_list_memberships_for_entries(
    p_user_id uuid,
    p_entry_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    WITH requested(entry_id) AS (
        SELECT DISTINCT unnest(COALESCE(p_entry_ids, ARRAY[]::uuid[]))
    ),
    memberships AS (
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
                )
            ) AS list_payload
        FROM requested
        JOIN user_word_list_items item ON item.word_id = requested.entry_id
        JOIN user_word_lists list ON list.id = item.list_id
        WHERE list.user_id = p_user_id
    ),
    grouped AS (
        SELECT
            entry_id,
            jsonb_agg(list_payload ORDER BY list_payload->>'name') AS lists
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
$$;

GRANT EXECUTE ON FUNCTION get_user_list_memberships_for_entries(uuid, uuid[]) TO authenticated;
