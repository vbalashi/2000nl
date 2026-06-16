-- Harden live-migration blockers found during senior readiness review.
-- - Revoke default PUBLIC/anon execute from RPCs recreated in 064.
-- - Keep user-dictionary helper functions internal to SECURITY DEFINER wrappers.
-- - Make get_active_training_scope read-only so its STABLE volatility is valid.

CREATE OR REPLACE FUNCTION assert_editable_user_dictionary(
    p_user_id uuid,
    p_dictionary_id uuid
) RETURNS dictionaries AS $$
DECLARE
    v_dictionary dictionaries%rowtype;
BEGIN
    SELECT * INTO v_dictionary
    FROM dictionaries
    WHERE id = p_dictionary_id;

    IF NOT FOUND
       OR v_dictionary.kind <> 'user'
       OR v_dictionary.owner_user_id IS DISTINCT FROM p_user_id
       OR NOT v_dictionary.is_editable
       OR v_dictionary.schema_key <> 'user-entry-v1'
       OR v_dictionary.schema_version <> 1 THEN
        RAISE EXCEPTION 'target_dictionary_not_editable'
            USING ERRCODE = '42501';
    END IF;

    RETURN v_dictionary;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE;

CREATE OR REPLACE FUNCTION get_active_training_scope(
    p_user_id uuid,
    p_language_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_language_code text := COALESCE(NULLIF(trim(p_language_code), ''), 'nl');
    v_scope user_training_scopes%rowtype;
    v_active_list_id uuid;
    v_active_list_type text;
    v_valid boolean := false;
    v_result jsonb;
BEGIN
    IF p_user_id IS DISTINCT FROM (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    SELECT *
    INTO v_scope
    FROM user_training_scopes
    WHERE user_id = p_user_id
      AND language_code = v_language_code;

    v_active_list_id := v_scope.active_list_id;
    v_active_list_type := v_scope.active_list_type;

    IF v_scope.user_id IS NOT NULL AND v_scope.active_list_id IS NOT NULL THEN
        IF v_scope.active_list_type = 'curated' THEN
            SELECT EXISTS (
                SELECT 1
                FROM word_lists l
                WHERE l.id = v_scope.active_list_id
                  AND l.language_code = v_language_code
            )
            INTO v_valid;
        ELSIF v_scope.active_list_type = 'user' THEN
            SELECT EXISTS (
                SELECT 1
                FROM user_word_lists l
                WHERE l.id = v_scope.active_list_id
                  AND l.user_id = p_user_id
                  AND (
                    COALESCE(l.primary_language_code, l.language_code) = v_language_code
                    OR (l.primary_language_code IS NULL AND l.language_code = v_language_code)
                  )
            )
            INTO v_valid;
        END IF;
    END IF;

    -- Return a repaired/default scope for stale list references, but do not
    -- persist that repair from a read RPC.
    IF v_scope.user_id IS NOT NULL AND v_scope.active_list_id IS NOT NULL AND NOT v_valid THEN
        v_active_list_id := NULL;
        v_active_list_type := NULL;
    END IF;

    SELECT jsonb_build_object(
        'language_code', v_language_code,
        'active_list_id', v_active_list_id,
        'active_list_type', v_active_list_type,
        'active_scenario', COALESCE(v_scope.active_scenario, settings.active_scenario, 'understanding'),
        'card_filter', COALESCE(v_scope.card_filter, settings.card_filter, 'both'),
        'modes_enabled', COALESCE(v_scope.modes_enabled, settings.modes_enabled, ARRAY['word-to-definition']::text[]),
        'new_review_ratio', COALESCE(v_scope.new_review_ratio, settings.new_review_ratio, 2),
        'has_saved_scope', v_scope.user_id IS NOT NULL,
        'is_valid', COALESCE(v_valid, false)
    )
    INTO v_result
    FROM user_settings settings
    WHERE settings.user_id = p_user_id;

    RETURN COALESCE(v_result, jsonb_build_object(
        'language_code', v_language_code,
        'active_list_id', NULL,
        'active_list_type', NULL,
        'active_scenario', 'understanding',
        'card_filter', 'both',
        'modes_enabled', ARRAY['word-to-definition']::text[],
        'new_review_ratio', 2,
        'has_saved_scope', false,
        'is_valid', false
    ));
END;
$$;

REVOKE EXECUTE ON FUNCTION get_available_learning_languages(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_available_dictionary_sources(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_active_word_list(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_active_word_list(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_active_training_scope(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_active_training_scope(uuid, text, uuid, text, text, text, text[], int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_available_word_lists(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int, text, uuid[]) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION assert_editable_user_dictionary(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION validate_user_entry_v1_payload(jsonb, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_available_learning_languages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_dictionary_sources(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_word_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_active_word_list(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_training_scope(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_active_training_scope(uuid, text, uuid, text, text, text, text[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_word_lists(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int, text, uuid[]) TO authenticated;

