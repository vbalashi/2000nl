-- Explicit list membership action behind ownership and dictionary access checks.

DROP FUNCTION IF EXISTS add_entry_to_user_list(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION add_entry_to_user_list(
    p_user_id uuid,
    p_list_id uuid,
    p_entry_id uuid
) RETURNS void AS $$
DECLARE
    v_dictionary_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM user_word_lists
        WHERE id = p_list_id
          AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    SELECT dictionary_id INTO v_dictionary_id
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    IF v_dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_dictionary_id, 'read') THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    INSERT INTO user_word_list_items (list_id, word_id)
    VALUES (p_list_id, p_entry_id)
    ON CONFLICT (list_id, word_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION add_entry_to_user_list(uuid, uuid, uuid) TO authenticated;
