-- Explicit user word-list CRUD actions behind ownership checks.

CREATE OR REPLACE FUNCTION create_user_word_list(
    p_user_id uuid,
    p_name text,
    p_description text DEFAULT NULL,
    p_language_code text DEFAULT 'nl',
    p_primary_language_code text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_list user_word_lists%ROWTYPE;
    v_name text;
    v_language_code text;
    v_primary_language_code text;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    v_name := NULLIF(trim(p_name), '');
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'invalid_list_name';
    END IF;

    v_language_code := NULLIF(trim(COALESCE(p_language_code, 'nl')), '');
    v_primary_language_code := NULLIF(
        trim(COALESCE(p_primary_language_code, v_language_code)),
        ''
    );

    IF v_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_primary_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_primary_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    INSERT INTO user_word_lists (
        user_id,
        name,
        description,
        language_code,
        primary_language_code
    )
    VALUES (
        p_user_id,
        v_name,
        NULLIF(p_description, ''),
        v_language_code,
        v_primary_language_code
    )
    RETURNING * INTO v_list;

    RETURN jsonb_build_object(
        'id', v_list.id,
        'name', v_list.name,
        'description', v_list.description,
        'language_code', v_list.language_code,
        'primary_language_code', v_list.primary_language_code,
        'created_at', v_list.created_at,
        'user_word_list_items', jsonb_build_array(jsonb_build_object('count', 0))
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_user_list';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION delete_user_word_list(
    p_user_id uuid,
    p_list_id uuid
) RETURNS void AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    DELETE FROM user_word_lists
    WHERE id = p_list_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION create_user_word_list(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_user_word_list(uuid, uuid) TO authenticated;
