-- Read and update cross-client learning preferences through explicit RPCs.

CREATE OR REPLACE FUNCTION get_learning_preferences(
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
        'training_mode', training_mode,
        'modes_enabled', modes_enabled,
        'card_filter', card_filter,
        'language_code', language_code,
        'new_review_ratio', new_review_ratio,
        'active_scenario', active_scenario,
        'daily_new_limit', daily_new_limit,
        'daily_review_limit', daily_review_limit,
        'target_retention', target_retention,
        'mix_mode', mix_mode,
        'use_fsrs', use_fsrs
    )
    INTO v_result
    FROM user_settings
    WHERE user_id = p_user_id;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION update_learning_preferences(
    p_user_id uuid,
    p_modes_enabled text[] DEFAULT NULL,
    p_card_filter text DEFAULT NULL,
    p_language_code text DEFAULT NULL,
    p_new_review_ratio int DEFAULT NULL,
    p_active_scenario text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_modes_enabled text[];
BEGIN
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    v_modes_enabled := CASE
        WHEN p_modes_enabled IS NULL THEN NULL
        WHEN array_length(p_modes_enabled, 1) IS NULL THEN ARRAY['word-to-definition']::text[]
        ELSE p_modes_enabled
    END;

    INSERT INTO user_settings (
        user_id,
        modes_enabled,
        training_mode,
        card_filter,
        language_code,
        new_review_ratio,
        active_scenario
    )
    VALUES (
        p_user_id,
        COALESCE(v_modes_enabled, ARRAY['word-to-definition']::text[]),
        COALESCE(v_modes_enabled[1], 'word-to-definition'),
        COALESCE(p_card_filter, 'both'),
        COALESCE(p_language_code, 'nl'),
        COALESCE(p_new_review_ratio, 2),
        COALESCE(p_active_scenario, 'understanding')
    )
    ON CONFLICT (user_id) DO UPDATE
    SET modes_enabled = COALESCE(v_modes_enabled, user_settings.modes_enabled),
        training_mode = COALESCE(v_modes_enabled[1], user_settings.training_mode),
        card_filter = COALESCE(p_card_filter, user_settings.card_filter),
        language_code = COALESCE(p_language_code, user_settings.language_code),
        new_review_ratio = COALESCE(p_new_review_ratio, user_settings.new_review_ratio),
        active_scenario = COALESCE(p_active_scenario, user_settings.active_scenario),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION get_learning_preferences(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_learning_preferences(uuid, text[], text, text, int, text) TO authenticated;
