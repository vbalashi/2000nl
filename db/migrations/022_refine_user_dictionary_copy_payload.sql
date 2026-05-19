-- Keep copied user entries focused on useful training content. Provenance is
-- tracked by sourceEntryId; notes should come from explicit user overrides.

DROP FUNCTION IF EXISTS copy_entry_to_user_dictionary(uuid, uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION copy_entry_to_user_dictionary(
    p_user_id uuid,
    p_source_entry_id uuid,
    p_target_dictionary_id uuid DEFAULT NULL,
    p_overrides jsonb DEFAULT '{}'::jsonb
) RETURNS uuid AS $$
DECLARE
    v_source word_entries%rowtype;
    v_target_dictionary dictionaries%rowtype;
    v_target_dictionary_id uuid;
    v_payload jsonb;
    v_headword text;
    v_language_code text;
    v_part_of_speech text;
    v_gender text;
    v_copied_entry_id uuid;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT * INTO v_source
    FROM word_entries
    WHERE id = p_source_entry_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'entry_not_found';
    END IF;

    IF v_source.dictionary_id IS NOT NULL
       AND NOT can_access_dictionary(p_user_id, v_source.dictionary_id, 'read') THEN
        RAISE EXCEPTION 'entry_not_accessible';
    END IF;

    v_target_dictionary_id := COALESCE(
        p_target_dictionary_id,
        ensure_user_dictionary(p_user_id, v_source.language_code, 'My dictionary')
    );

    SELECT * INTO v_target_dictionary
    FROM dictionaries
    WHERE id = v_target_dictionary_id;

    IF NOT FOUND
       OR v_target_dictionary.kind <> 'user'
       OR v_target_dictionary.owner_user_id <> p_user_id
       OR NOT v_target_dictionary.is_editable
       OR v_target_dictionary.schema_key <> 'user-entry-v1'
       OR v_target_dictionary.schema_version <> 1 THEN
        RAISE EXCEPTION 'target_dictionary_not_editable';
    END IF;

    v_payload := jsonb_strip_nulls(jsonb_build_object(
        'headword', v_source.headword,
        'languageCode', v_source.language_code,
        'definition', COALESCE(
            NULLIF(p_overrides->>'definition', ''),
            NULLIF(v_source.raw#>>'{meanings,0,definition}', ''),
            NULLIF(v_source.raw#>>'{definition}', '')
        ),
        'partOfSpeech', v_source.part_of_speech,
        'gender', v_source.gender,
        'notes', NULLIF(p_overrides->>'notes', ''),
        'sourceEntryId', v_source.id::text
    )) || COALESCE(p_overrides, '{}'::jsonb);

    v_headword := NULLIF(v_payload->>'headword', '');
    v_language_code := NULLIF(v_payload->>'languageCode', '');
    v_part_of_speech := NULLIF(v_payload->>'partOfSpeech', '');
    v_gender := NULLIF(v_payload->>'gender', '');

    IF v_headword IS NULL OR v_language_code IS NULL THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF NOT (
        v_payload ? 'definition'
        OR v_payload ? 'translation'
        OR v_payload ? 'example'
        OR v_payload ? 'notes'
    ) THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF v_language_code <> v_target_dictionary.language_code THEN
        RAISE EXCEPTION 'language_mismatch';
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
        v_target_dictionary_id,
        v_language_code,
        v_headword,
        COALESCE(v_source.meaning_id, 1),
        v_part_of_speech,
        v_gender,
        false,
        v_payload
    )
    ON CONFLICT (dictionary_id, language_code, headword, meaning_id)
    WHERE dictionary_id IS NOT NULL
    DO UPDATE SET
        part_of_speech = excluded.part_of_speech,
        gender = excluded.gender,
        raw = excluded.raw
    RETURNING id INTO v_copied_entry_id;

    RETURN v_copied_entry_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION copy_entry_to_user_dictionary(uuid, uuid, uuid, jsonb) TO authenticated;
