-- Explicit CRUD actions for user-entry-v1 entries in owned editable dictionaries.

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
       OR v_dictionary.owner_user_id <> p_user_id
       OR NOT v_dictionary.is_editable
       OR v_dictionary.schema_key <> 'user-entry-v1'
       OR v_dictionary.schema_version <> 1 THEN
        RAISE EXCEPTION 'target_dictionary_not_editable';
    END IF;

    RETURN v_dictionary;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE;

CREATE OR REPLACE FUNCTION validate_user_entry_v1_payload(
    p_payload jsonb,
    p_dictionary_language_code text
) RETURNS jsonb AS $$
DECLARE
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_headword text := NULLIF(trim(v_payload->>'headword'), '');
    v_language_code text := NULLIF(trim(v_payload->>'languageCode'), '');
BEGIN
    IF jsonb_typeof(v_payload) <> 'object' THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF v_headword IS NULL OR v_language_code IS NULL THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF v_language_code <> p_dictionary_language_code THEN
        RAISE EXCEPTION 'language_mismatch';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF NOT (
        NULLIF(trim(v_payload->>'definition'), '') IS NOT NULL
        OR (
            jsonb_typeof(v_payload->'translation') = 'object'
            AND NULLIF(trim(v_payload#>>'{translation,text}'), '') IS NOT NULL
        )
        OR (
            jsonb_typeof(v_payload->'example') = 'object'
            AND NULLIF(trim(v_payload#>>'{example,source}'), '') IS NOT NULL
        )
        OR NULLIF(trim(v_payload->>'notes'), '') IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    RETURN jsonb_strip_nulls(
        jsonb_build_object(
            'headword', v_headword,
            'languageCode', v_language_code,
            'definition', NULLIF(trim(v_payload->>'definition'), ''),
            'translation', CASE
                WHEN jsonb_typeof(v_payload->'translation') = 'object' THEN
                    jsonb_strip_nulls(jsonb_build_object(
                        'languageCode', NULLIF(trim(v_payload#>>'{translation,languageCode}'), ''),
                        'text', NULLIF(trim(v_payload#>>'{translation,text}'), '')
                    ))
                ELSE NULL
            END,
            'example', CASE
                WHEN jsonb_typeof(v_payload->'example') = 'object' THEN
                    jsonb_strip_nulls(jsonb_build_object(
                        'source', NULLIF(trim(v_payload#>>'{example,source}'), ''),
                        'translation', NULLIF(trim(v_payload#>>'{example,translation}'), '')
                    ))
                ELSE NULL
            END,
            'partOfSpeech', NULLIF(trim(v_payload->>'partOfSpeech'), ''),
            'gender', NULLIF(trim(v_payload->>'gender'), ''),
            'notes', NULLIF(trim(v_payload->>'notes'), ''),
            'tags', CASE
                WHEN jsonb_typeof(v_payload->'tags') = 'array' THEN v_payload->'tags'
                ELSE NULL
            END,
            'sourceEntryId', NULLIF(trim(v_payload->>'sourceEntryId'), '')
        )
    );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE;

CREATE OR REPLACE FUNCTION create_user_dictionary_entry(
    p_user_id uuid,
    p_dictionary_id uuid DEFAULT NULL,
    p_entry jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
    v_dictionary_id uuid;
    v_dictionary dictionaries%rowtype;
    v_payload jsonb;
    v_word_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    v_dictionary_id := COALESCE(
        p_dictionary_id,
        ensure_user_dictionary(
            p_user_id,
            COALESCE(NULLIF(trim(p_entry->>'languageCode'), ''), 'nl'),
            'My dictionary'
        )
    );
    v_dictionary := assert_editable_user_dictionary(p_user_id, v_dictionary_id);
    v_payload := validate_user_entry_v1_payload(p_entry, v_dictionary.language_code);

    IF EXISTS (
        SELECT 1
        FROM word_entries
        WHERE dictionary_id = v_dictionary_id
          AND language_code = v_payload->>'languageCode'
          AND headword = v_payload->>'headword'
          AND meaning_id = 1
    ) THEN
        RAISE EXCEPTION 'duplicate_user_entry';
    END IF;

    INSERT INTO word_entries (
        dictionary_id,
        language_code,
        headword,
        meaning_id,
        part_of_speech,
        gender,
        is_nt2_2000,
        raw
    )
    VALUES (
        v_dictionary_id,
        v_payload->>'languageCode',
        v_payload->>'headword',
        1,
        v_payload->>'partOfSpeech',
        v_payload->>'gender',
        false,
        v_payload
    )
    RETURNING id INTO v_word_id;

    RETURN v_word_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS update_user_dictionary_entry(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION update_user_dictionary_entry(
    p_user_id uuid,
    p_entry_id uuid,
    p_entry jsonb
) RETURNS uuid AS $$
DECLARE
    v_existing word_entries%rowtype;
    v_dictionary dictionaries%rowtype;
    v_payload jsonb;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_existing
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    v_dictionary := assert_editable_user_dictionary(p_user_id, v_existing.dictionary_id);
    v_payload := validate_user_entry_v1_payload(p_entry, v_dictionary.language_code);

    IF EXISTS (
        SELECT 1
        FROM word_entries
        WHERE dictionary_id = v_existing.dictionary_id
          AND language_code = v_payload->>'languageCode'
          AND headword = v_payload->>'headword'
          AND meaning_id = v_existing.meaning_id
          AND id <> p_entry_id
    ) THEN
        RAISE EXCEPTION 'duplicate_user_entry';
    END IF;

    UPDATE word_entries
    SET language_code = v_payload->>'languageCode',
        headword = v_payload->>'headword',
        part_of_speech = v_payload->>'partOfSpeech',
        gender = v_payload->>'gender',
        is_nt2_2000 = false,
        raw = v_payload
    WHERE id = p_entry_id;

    RETURN p_entry_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS delete_user_dictionary_entry(uuid, uuid);

CREATE OR REPLACE FUNCTION delete_user_dictionary_entry(
    p_user_id uuid,
    p_entry_id uuid
) RETURNS void AS $$
DECLARE
    v_existing word_entries%rowtype;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_existing
    FROM word_entries
    WHERE id = p_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    PERFORM assert_editable_user_dictionary(p_user_id, v_existing.dictionary_id);

    DELETE FROM word_entries
    WHERE id = p_entry_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION assert_editable_user_dictionary(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_user_entry_v1_payload(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_dictionary_entry(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_dictionary_entry(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_user_dictionary_entry(uuid, uuid) TO authenticated;
