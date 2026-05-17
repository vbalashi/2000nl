-- Read-only dictionary lookup gated by dictionary visibility.
-- Generated: 2026-05-17

CREATE OR REPLACE FUNCTION fetch_dictionary_entry_gated(
    p_headword text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_normalized text;
    v_entry word_entries%rowtype;
    v_meanings_count int;
    v_stats jsonb;
BEGIN
    v_user_id := (select auth.uid());
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_normalized := btrim(COALESCE(p_headword, ''));
    IF v_normalized = '' THEN
        RETURN NULL;
    END IF;

    SELECT w.* INTO v_entry
    FROM word_entries w
    WHERE w.headword = v_normalized
      AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
    ORDER BY w.headword ASC, w.meaning_id ASC NULLS LAST
    LIMIT 1;

    IF NOT FOUND AND lower(v_normalized) <> v_normalized THEN
        SELECT w.* INTO v_entry
        FROM word_entries w
        WHERE w.headword = lower(v_normalized)
          AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
        ORDER BY w.headword ASC, w.meaning_id ASC NULLS LAST
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        SELECT w.* INTO v_entry
        FROM word_forms f
        JOIN word_entries w ON w.id = f.word_id
        WHERE f.form = lower(v_normalized)
          AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
        ORDER BY f.headword ASC, w.meaning_id ASC NULLS LAST
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*) INTO v_meanings_count
    FROM word_entries w
    WHERE w.headword = v_entry.headword
      AND w.language_code = v_entry.language_code
      AND (
            (v_entry.dictionary_id IS NULL AND w.dictionary_id IS NULL)
         OR w.dictionary_id = v_entry.dictionary_id
      )
      AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'));

    SELECT jsonb_build_object(
        'click_count', s.click_count,
        'last_seen_at', s.last_seen_at
    ) INTO v_stats
    FROM user_word_status s
    WHERE s.user_id = v_user_id
      AND s.word_id = v_entry.id
    ORDER BY s.last_seen_at DESC NULLS LAST
    LIMIT 1;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'id', v_entry.id,
        'dictionary_id', v_entry.dictionary_id,
        'language_code', v_entry.language_code,
        'headword', v_entry.headword,
        'part_of_speech', v_entry.part_of_speech,
        'gender', v_entry.gender,
        'raw', v_entry.raw,
        'is_nt2_2000', v_entry.is_nt2_2000,
        'meanings_count', COALESCE(v_meanings_count, 1),
        'stats', v_stats
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION fetch_dictionary_entry_gated(text) TO authenticated;
