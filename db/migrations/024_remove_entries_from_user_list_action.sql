-- Explicit user-list membership removal behind ownership checks.

CREATE OR REPLACE FUNCTION remove_entries_from_user_list(
    p_user_id uuid,
    p_list_id uuid,
    p_word_ids uuid[]
) RETURNS void AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF p_word_ids IS NULL OR array_length(p_word_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM user_word_lists
        WHERE id = p_list_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    DELETE FROM user_word_list_items
    WHERE list_id = p_list_id
      AND word_id = ANY(p_word_ids);
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION remove_entries_from_user_list(uuid, uuid, uuid[]) TO authenticated;
