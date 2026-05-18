-- List curated and user word lists through one explicit read boundary.

CREATE OR REPLACE FUNCTION get_available_word_lists(
    p_user_id uuid,
    p_language_code text DEFAULT NULL,
    p_list_type text DEFAULT NULL
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
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    WITH curated AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'curated',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'is_primary', l.is_primary,
            'sort_order', l.sort_order,
            'word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        ) AS row,
        COALESCE(l.sort_order, 2147483647) AS sort_order,
        l.is_primary,
        l.name,
        NULL::timestamptz AS created_at
        FROM word_lists l
        WHERE (p_list_type IS NULL OR p_list_type = 'curated')
          AND (p_language_code IS NULL OR l.language_code = p_language_code)
    ),
    user_lists AS (
        SELECT jsonb_build_object(
            'id', l.id,
            'list_type', 'user',
            'name', l.name,
            'description', l.description,
            'language_code', l.language_code,
            'primary_language_code', l.primary_language_code,
            'created_at', l.created_at,
            'user_word_list_items', jsonb_build_array(jsonb_build_object(
                'count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items item
                    WHERE item.list_id = l.id
                )
            ))
        ) AS row,
        2147483647 AS sort_order,
        false AS is_primary,
        l.name,
        l.created_at
        FROM user_word_lists l
        WHERE (p_list_type IS NULL OR p_list_type = 'user')
          AND l.user_id = p_user_id
    ),
    combined AS (
        SELECT row, 0 AS group_order, sort_order, is_primary, name, created_at
        FROM curated
        UNION ALL
        SELECT row, 1 AS group_order, sort_order, is_primary, name, created_at
        FROM user_lists
    )
    SELECT COALESCE(
        jsonb_agg(row ORDER BY group_order, sort_order, is_primary DESC, name ASC, created_at DESC),
        '[]'::jsonb
    )
    INTO v_result
    FROM combined;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_word_lists(uuid, text, text) TO authenticated;
