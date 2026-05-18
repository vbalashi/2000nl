-- Return all accessible dictionary candidates for a headword/form lookup.

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
    v_lookup_headword text;
    v_result jsonb;
BEGIN
    v_user_id := (select auth.uid());
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    v_normalized := btrim(COALESCE(p_headword, ''));
    IF v_normalized = '' THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT w.headword INTO v_lookup_headword
    FROM word_entries w
    WHERE w.headword = v_normalized
      AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
    ORDER BY
      CASE
        WHEN w.dictionary_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM dictionaries d
          WHERE d.id = w.dictionary_id
            AND d.owner_user_id = v_user_id
        ) THEN 0
        ELSE 1
      END,
      w.headword ASC,
      w.meaning_id ASC NULLS LAST
    LIMIT 1;

    IF v_lookup_headword IS NULL AND lower(v_normalized) <> v_normalized THEN
        SELECT w.headword INTO v_lookup_headword
        FROM word_entries w
        WHERE w.headword = lower(v_normalized)
          AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
        ORDER BY
          CASE
            WHEN w.dictionary_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM dictionaries d
              WHERE d.id = w.dictionary_id
                AND d.owner_user_id = v_user_id
            ) THEN 0
            ELSE 1
          END,
          w.headword ASC,
          w.meaning_id ASC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_lookup_headword IS NULL THEN
        SELECT w.headword INTO v_lookup_headword
        FROM word_forms f
        JOIN word_entries w ON w.id = f.word_id
        WHERE f.form = lower(v_normalized)
          AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
        ORDER BY
          CASE
            WHEN w.dictionary_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM dictionaries d
              WHERE d.id = w.dictionary_id
                AND d.owner_user_id = v_user_id
            ) THEN 0
            ELSE 1
          END,
          f.headword ASC,
          w.meaning_id ASC NULLS LAST
        LIMIT 1;
    END IF;

    IF v_lookup_headword IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    WITH candidates AS (
        SELECT
            w.*,
            d.kind AS dictionary_kind,
            d.owner_user_id,
            COUNT(*) OVER (
                PARTITION BY w.dictionary_id, w.language_code, w.headword
            ) AS meanings_count
        FROM word_entries w
        LEFT JOIN dictionaries d ON d.id = w.dictionary_id
        WHERE w.headword = v_lookup_headword
          AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
    ),
    candidate_payloads AS (
        SELECT jsonb_strip_nulls(jsonb_build_object(
            'id', c.id,
            'dictionary_id', c.dictionary_id,
            'language_code', c.language_code,
            'headword', c.headword,
            'meaning_id', c.meaning_id,
            'part_of_speech', c.part_of_speech,
            'gender', c.gender,
            'raw', c.raw,
            'is_nt2_2000', c.is_nt2_2000,
            'meanings_count', COALESCE(c.meanings_count, 1),
            'stats', (
                SELECT jsonb_build_object(
                    'click_count', s.click_count,
                    'last_seen_at', s.last_seen_at
                )
                FROM user_word_status s
                WHERE s.user_id = v_user_id
                  AND s.word_id = c.id
                ORDER BY s.last_seen_at DESC NULLS LAST
                LIMIT 1
            )
        )) AS payload,
        CASE
            WHEN c.owner_user_id = v_user_id THEN 0
            WHEN c.dictionary_kind = 'curated' THEN 1
            ELSE 2
        END AS dictionary_rank,
        c.language_code,
        c.headword,
        c.meaning_id
        FROM candidates c
    )
    SELECT COALESCE(
        jsonb_agg(payload ORDER BY dictionary_rank, language_code, headword, meaning_id),
        '[]'::jsonb
    )
    INTO v_result
    FROM candidate_payloads;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION fetch_dictionary_entry_gated(text) TO authenticated;
