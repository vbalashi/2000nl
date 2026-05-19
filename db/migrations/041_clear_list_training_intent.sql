-- Allow callers to explicitly clear list-level default training scenario.
-- NULL still means "preserve existing value" for compatibility.

DROP FUNCTION IF EXISTS update_user_word_list(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text[]
);

CREATE OR REPLACE FUNCTION update_user_word_list(
    p_user_id uuid,
    p_list_id uuid,
    p_name text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_language_code text DEFAULT NULL,
    p_primary_language_code text DEFAULT NULL,
    p_default_scenario_id text DEFAULT NULL,
    p_card_policy text DEFAULT NULL,
    p_card_type_ids text[] DEFAULT NULL,
    p_clear_default_scenario boolean DEFAULT false
) RETURNS jsonb AS $$
DECLARE
    v_existing user_word_lists%ROWTYPE;
    v_list user_word_lists%ROWTYPE;
    v_name text;
    v_language_code text;
    v_primary_language_code text;
    v_default_scenario_id text;
    v_card_policy text;
    v_card_type_ids text[];
    v_item_count int;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_existing
    FROM user_word_lists
    WHERE id = p_list_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'list_not_found';
    END IF;

    v_name := COALESCE(NULLIF(trim(p_name), ''), v_existing.name);
    IF v_name IS NULL THEN
        RAISE EXCEPTION 'invalid_list_name';
    END IF;

    v_language_code := COALESCE(
        NULLIF(trim(p_language_code), ''),
        v_existing.language_code
    );
    v_primary_language_code := COALESCE(
        NULLIF(trim(p_primary_language_code), ''),
        v_existing.primary_language_code,
        v_language_code
    );
    v_default_scenario_id := CASE
        WHEN COALESCE(p_clear_default_scenario, false) THEN NULL
        ELSE COALESCE(
            NULLIF(trim(p_default_scenario_id), ''),
            v_existing.default_scenario_id
        )
    END;
    v_card_policy := private.normalize_list_card_policy(
        p_card_policy,
        v_existing.card_policy
    );
    v_card_type_ids := CASE
        WHEN p_card_type_ids IS NULL THEN v_existing.card_type_ids
        ELSE ARRAY(
            SELECT DISTINCT trim(card_type_id)
            FROM unnest(p_card_type_ids) AS card_type_id
            WHERE NULLIF(trim(card_type_id), '') IS NOT NULL
            ORDER BY trim(card_type_id)
        )
    END;
    IF v_card_type_ids IS NOT NULL AND array_length(v_card_type_ids, 1) IS NULL THEN
        v_card_type_ids := NULL;
    END IF;

    IF v_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_primary_language_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM languages WHERE code = v_primary_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    PERFORM private.validate_list_training_intent(
        v_default_scenario_id,
        v_card_policy,
        v_card_type_ids
    );

    UPDATE user_word_lists
    SET name = v_name,
        description = CASE
            WHEN p_description IS NULL THEN description
            ELSE NULLIF(p_description, '')
        END,
        language_code = v_language_code,
        primary_language_code = v_primary_language_code,
        default_scenario_id = v_default_scenario_id,
        card_policy = v_card_policy,
        card_type_ids = v_card_type_ids,
        updated_at = now()
    WHERE id = p_list_id
      AND user_id = p_user_id
    RETURNING * INTO v_list;

    SELECT COUNT(*) INTO v_item_count
    FROM user_word_list_items
    WHERE list_id = v_list.id;

    RETURN jsonb_build_object(
        'id', v_list.id,
        'name', v_list.name,
        'description', v_list.description,
        'language_code', v_list.language_code,
        'primary_language_code', v_list.primary_language_code,
        'default_scenario_id', v_list.default_scenario_id,
        'card_policy', v_list.card_policy,
        'card_type_ids', v_list.card_type_ids,
        'created_at', v_list.created_at,
        'user_word_list_items', jsonb_build_array(jsonb_build_object('count', v_item_count))
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'duplicate_user_list';
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp;

GRANT EXECUTE ON FUNCTION update_user_word_list(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text[],
    boolean
) TO authenticated;
