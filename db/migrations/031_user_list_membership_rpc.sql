-- Read user-list membership through an explicit ownership-checked RPC.

CREATE OR REPLACE FUNCTION get_user_list_membership(
    p_user_id uuid,
    p_list_id uuid,
    p_word_ids uuid[]
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_word_ids uuid[];
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM user_word_lists
        WHERE id = p_list_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'user_list_not_found';
    END IF;

    SELECT COALESCE(array_agg(item.word_id ORDER BY item.word_id), ARRAY[]::uuid[])
    INTO v_word_ids
    FROM user_word_list_items item
    WHERE item.list_id = p_list_id
      AND item.word_id = ANY(COALESCE(p_word_ids, ARRAY[]::uuid[]));

    RETURN v_word_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_list_membership(uuid, uuid, uuid[]) TO authenticated;
