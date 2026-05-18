-- Read a curated or user list summary through a single explicit RPC.

CREATE OR REPLACE FUNCTION get_word_list_summary(
    p_user_id uuid,
    p_list_id uuid,
    p_list_type text
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

    IF p_list_type = 'user' THEN
        SELECT jsonb_build_object(
            'id', l.id,
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
        )
        INTO v_result
        FROM user_word_lists l
        WHERE l.id = p_list_id
          AND l.user_id = p_user_id;

        RETURN v_result;
    END IF;

    SELECT jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'description', l.description,
        'language_code', l.language_code,
        'primary_language_code', l.primary_language_code,
        'is_primary', l.is_primary,
        'word_list_items', jsonb_build_array(jsonb_build_object(
            'count', (
                SELECT COUNT(*)::int
                FROM word_list_items item
                WHERE item.list_id = l.id
            )
        ))
    )
    INTO v_result
    FROM word_lists l
    WHERE l.id = p_list_id;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_word_list_summary(uuid, uuid, text) TO authenticated;
