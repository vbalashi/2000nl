-- Read a single dictionary entry by id behind dictionary access checks.

CREATE OR REPLACE FUNCTION fetch_dictionary_entry_by_id_gated(
    p_word_id uuid
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
    WHERE w.id = p_word_id
      AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'));

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE;

GRANT EXECUTE ON FUNCTION fetch_dictionary_entry_by_id_gated(uuid) TO authenticated;
