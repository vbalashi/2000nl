-- Rename public platform-facing RPC parameters and payload keys from word_id to
-- entry_id terminology. Physical table names remain unchanged for now.

DROP FUNCTION IF EXISTS fetch_dictionary_entry_by_id_gated(uuid);

CREATE OR REPLACE FUNCTION fetch_dictionary_entry_by_id_gated(
    p_entry_id uuid
) RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
    v_entry jsonb;
BEGIN
    v_user_id := (select auth.uid());

    SELECT jsonb_build_object(
        'id', w.id,
        'dictionary_id', w.dictionary_id,
        'language_code', w.language_code,
        'headword', w.headword,
        'meaning_id', w.meaning_id,
        'part_of_speech', w.part_of_speech,
        'gender', w.gender,
        'raw', w.raw,
        'is_nt2_2000', w.is_nt2_2000,
        'meanings_count', (
            SELECT COUNT(*)
            FROM word_entries we
            WHERE we.headword = w.headword
              AND we.language_code = w.language_code
              AND (
                    (w.dictionary_id IS NULL AND we.dictionary_id IS NULL)
                 OR we.dictionary_id = w.dictionary_id
              )
        )
    )
    INTO v_entry
    FROM word_entries w
    WHERE w.id = p_entry_id
      AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'));

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE;

GRANT EXECUTE ON FUNCTION fetch_dictionary_entry_by_id_gated(uuid) TO authenticated;

DROP FUNCTION IF EXISTS get_user_list_memberships_for_entries(uuid, uuid[]);

CREATE OR REPLACE FUNCTION get_user_list_memberships_for_entries(
    p_user_id uuid,
    p_entry_ids uuid[]
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
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    WITH requested(entry_id) AS (
        SELECT DISTINCT unnest(COALESCE(p_entry_ids, ARRAY[]::uuid[]))
    ),
    memberships AS (
        SELECT
            item.word_id AS entry_id,
            jsonb_build_object(
                'id', list.id,
                'kind', 'user',
                'name', list.name,
                'description', list.description,
                'primary_language_code', list.primary_language_code,
                'item_count', (
                    SELECT COUNT(*)::int
                    FROM user_word_list_items count_item
                    WHERE count_item.list_id = list.id
                )
            ) AS list_payload
        FROM requested
        JOIN user_word_list_items item ON item.word_id = requested.entry_id
        JOIN user_word_lists list ON list.id = item.list_id
        WHERE list.user_id = p_user_id
    ),
    grouped AS (
        SELECT
            entry_id,
            jsonb_agg(list_payload ORDER BY list_payload->>'name') AS lists
        FROM memberships
        GROUP BY entry_id
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'entry_id', entry_id,
                'lists', lists
            )
            ORDER BY entry_id
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM grouped;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_list_memberships_for_entries(uuid, uuid[]) TO authenticated;

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

DROP FUNCTION IF EXISTS remove_entries_from_user_list(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION remove_entries_from_user_list(
    p_user_id uuid,
    p_list_id uuid,
    p_entry_ids uuid[]
) RETURNS void AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF p_entry_ids IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
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
      AND word_id = ANY(p_entry_ids);
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION remove_entries_from_user_list(uuid, uuid, uuid[]) TO authenticated;

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

GRANT EXECUTE ON FUNCTION update_user_dictionary_entry(uuid, uuid, jsonb) TO authenticated;

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

GRANT EXECUTE ON FUNCTION delete_user_dictionary_entry(uuid, uuid) TO authenticated;
