-- Read and update active training list through explicit RPCs.

CREATE OR REPLACE FUNCTION get_active_word_list(
    p_user_id uuid
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

    SELECT jsonb_build_object(
        'active_list_id', active_list_id,
        'active_list_type', active_list_type
    )
    INTO v_result
    FROM user_settings
    WHERE user_id = p_user_id;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION update_active_word_list(
    p_user_id uuid,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_list_type text;
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    v_list_type := CASE
        WHEN p_list_id IS NULL THEN NULL
        WHEN p_list_type IN ('curated', 'user') THEN p_list_type
        ELSE 'curated'
    END;

    INSERT INTO user_settings (user_id, active_list_id, active_list_type)
    VALUES (p_user_id, p_list_id, v_list_type)
    ON CONFLICT (user_id) DO UPDATE
    SET active_list_id = excluded.active_list_id,
        active_list_type = excluded.active_list_type;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_word_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_active_word_list(uuid, uuid, text) TO authenticated;
