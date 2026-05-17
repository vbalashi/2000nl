-- Enforce dictionary read access in gated word-entry RPCs.
-- Generated: 2026-05-17

CREATE OR REPLACE FUNCTION search_word_entries_gated(
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_tier text;
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_items jsonb;
BEGIN
    v_user_id := (select auth.uid());
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'is_locked', true, 'max_allowed', 0);
    END IF;

    v_tier := get_user_tier(v_user_id);
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
    v_limit := p_page_size;

    WITH visible_entries AS (
        SELECT w.*
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
          AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
    )
    SELECT COUNT(*) INTO v_total
    FROM visible_entries;

    IF v_max_allowed IS NOT NULL AND v_offset >= v_max_allowed THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', v_total, 'is_locked', true, 'max_allowed', v_max_allowed);
    END IF;

    IF v_max_allowed IS NOT NULL AND (v_offset + v_limit) > v_max_allowed THEN
        v_limit := v_max_allowed - v_offset;
    END IF;

    WITH visible_entries AS (
        SELECT w.*
        FROM word_entries w
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
          AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
    )
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_items
    FROM (
        SELECT id, dictionary_id, language_code, headword, part_of_speech, gender, raw, is_nt2_2000
        FROM visible_entries
        ORDER BY headword ASC
        OFFSET v_offset LIMIT v_limit
    ) t;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed IS NOT NULL AND v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
END;
$$;

CREATE OR REPLACE FUNCTION fetch_words_for_list_gated(
    p_list_id uuid,
    p_list_type text DEFAULT 'curated',
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_tier text;
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_items jsonb;
BEGIN
    v_user_id := (select auth.uid());
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'is_locked', true, 'max_allowed', 0);
    END IF;

    v_tier := get_user_tier(v_user_id);
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
    v_limit := p_page_size;

    IF p_list_type <> 'curated'
       AND NOT EXISTS (SELECT 1 FROM user_word_lists WHERE id = p_list_id AND user_id = v_user_id) THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'is_locked', false, 'max_allowed', v_max_allowed);
    END IF;

    IF p_list_type = 'curated' THEN
        WITH visible_entries AS (
            SELECT w.*, COALESCE(li.rank, 999999) AS sort_rank
            FROM word_entries w
            JOIN word_list_items li ON li.word_id = w.id
            WHERE li.list_id = p_list_id
              AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
              AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
              AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
              AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
              AND (p_filter_hidden IS NULL OR p_filter_hidden = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
              AND (p_filter_frozen IS NULL OR p_filter_frozen = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
        )
        SELECT COUNT(*) INTO v_total
        FROM visible_entries;
    ELSE
        WITH visible_entries AS (
            SELECT w.*, li.added_at
            FROM word_entries w
            JOIN user_word_list_items li ON li.word_id = w.id
            WHERE li.list_id = p_list_id
              AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
              AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
              AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
              AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
              AND (p_filter_hidden IS NULL OR p_filter_hidden = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
              AND (p_filter_frozen IS NULL OR p_filter_frozen = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
        )
        SELECT COUNT(*) INTO v_total
        FROM visible_entries;
    END IF;

    IF v_max_allowed IS NOT NULL AND v_offset >= v_max_allowed THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', v_total, 'is_locked', true, 'max_allowed', v_max_allowed);
    END IF;

    IF v_max_allowed IS NOT NULL AND (v_offset + v_limit) > v_max_allowed THEN
        v_limit := v_max_allowed - v_offset;
    END IF;

    IF p_list_type = 'curated' THEN
        WITH visible_entries AS (
            SELECT w.*, COALESCE(li.rank, 999999) AS sort_rank
            FROM word_entries w
            JOIN word_list_items li ON li.word_id = w.id
            WHERE li.list_id = p_list_id
              AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
              AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
              AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
              AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
              AND (p_filter_hidden IS NULL OR p_filter_hidden = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
              AND (p_filter_frozen IS NULL OR p_filter_frozen = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
        )
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_rank, t.headword), '[]'::jsonb) INTO v_items
        FROM (
            SELECT id, dictionary_id, language_code, headword, part_of_speech, gender, raw, is_nt2_2000, sort_rank
            FROM visible_entries
            ORDER BY sort_rank ASC, headword ASC
            OFFSET v_offset LIMIT v_limit
        ) t;
    ELSE
        WITH visible_entries AS (
            SELECT w.*, li.added_at
            FROM word_entries w
            JOIN user_word_list_items li ON li.word_id = w.id
            WHERE li.list_id = p_list_id
              AND (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
              AND (p_query IS NULL OR w.headword ILIKE '%' || p_query || '%')
              AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
              AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
              AND (p_filter_hidden IS NULL OR p_filter_hidden = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND COALESCE(s.hidden, false) = true))
              AND (p_filter_frozen IS NULL OR p_filter_frozen = false
                   OR EXISTS (SELECT 1 FROM user_word_status s WHERE s.user_id = v_user_id AND s.word_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
        )
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_items
        FROM (
            SELECT id, dictionary_id, language_code, headword, part_of_speech, gender, raw, is_nt2_2000
            FROM visible_entries
            ORDER BY added_at DESC, headword ASC
            OFFSET v_offset LIMIT v_limit
        ) t;
    END IF;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed IS NOT NULL AND v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
END;
$$;

GRANT EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_words_for_list_gated(uuid, text, text, text, boolean, boolean, boolean, int, int) TO authenticated;
