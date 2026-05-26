-- Rank dictionary lookup like a dictionary product: exact/form matches first,
-- broad headword/raw matches later, with row metadata explaining each match.

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
    v_query text;
    v_like_query text;
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
    v_query := NULLIF(lower(trim(COALESCE(p_query, ''))), '');
    v_like_query := CASE WHEN v_query IS NULL THEN NULL ELSE '%' || v_query || '%' END;
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
    v_limit := p_page_size;

    WITH visible_entries AS (
        SELECT w.*, d.name AS dictionary_name, d.slug AS dictionary_slug, d.kind AS dictionary_kind, d.owner_user_id
        FROM word_entries w
        LEFT JOIN dictionaries d ON d.id = w.dictionary_id
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
    ),
    ranked_entries AS (
        SELECT
            v.*,
            CASE
                WHEN v_query IS NULL THEN 6
                WHEN lower(v.headword) = v_query THEN 1
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 2
                WHEN lower(v.headword) LIKE v_like_query THEN 3
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 4
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 5
                WHEN lower(v.raw::text) LIKE v_like_query THEN 6
                ELSE NULL
            END AS search_group_rank,
            CASE
                WHEN v.dictionary_kind = 'user' AND v.owner_user_id = v_user_id THEN 0
                WHEN v.dictionary_kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank,
            CASE
                WHEN v_query IS NULL THEN 0
                WHEN lower(v.headword) = v_query THEN 0
                WHEN lower(v.headword) LIKE v_query || '%' THEN 1
                WHEN lower(v.headword) LIKE v_like_query THEN 2
                ELSE 3
            END AS headword_rank
        FROM visible_entries v
    )
    SELECT COUNT(*) INTO v_total
    FROM ranked_entries
    WHERE search_group_rank IS NOT NULL;

    IF v_max_allowed IS NOT NULL AND v_offset >= v_max_allowed THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', v_total, 'is_locked', true, 'max_allowed', v_max_allowed);
    END IF;

    IF v_max_allowed IS NOT NULL AND (v_offset + v_limit) > v_max_allowed THEN
        v_limit := v_max_allowed - v_offset;
    END IF;

    WITH visible_entries AS (
        SELECT w.*, d.name AS dictionary_name, d.slug AS dictionary_slug, d.kind AS dictionary_kind, d.owner_user_id
        FROM word_entries w
        LEFT JOIN dictionaries d ON d.id = w.dictionary_id
        WHERE (w.dictionary_id IS NULL OR can_access_dictionary(v_user_id, w.dictionary_id, 'read'))
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND COALESCE(s.hidden, false) = true))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (SELECT 1 FROM user_card_status s WHERE s.user_id = v_user_id AND s.entry_id = w.id AND s.frozen_until IS NOT NULL AND s.frozen_until > now()))
    ),
    ranked_entries AS (
        SELECT
            v.*,
            CASE
                WHEN v_query IS NULL THEN 6
                WHEN lower(v.headword) = v_query THEN 1
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 2
                WHEN lower(v.headword) LIKE v_like_query THEN 3
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 4
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 5
                WHEN lower(v.raw::text) LIKE v_like_query THEN 6
                ELSE NULL
            END AS search_group_rank,
            CASE
                WHEN v_query IS NULL THEN 'fallback'
                WHEN lower(v.headword) = v_query THEN 'exact-headword'
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 'lemma-or-inflection'
                WHEN lower(v.headword) LIKE v_like_query THEN 'related-headword'
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 'example'
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 'definition'
                ELSE 'fallback'
            END AS search_match_group,
            CASE
                WHEN v_query IS NULL THEN 'Bladeren'
                WHEN lower(v.headword) = v_query THEN 'Exacte match'
                WHEN EXISTS (
                    SELECT 1
                    FROM word_forms f
                    WHERE f.word_id = v.id
                      AND lower(f.form) = v_query
                      AND (
                        (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
                        OR f.dictionary_id = v.dictionary_id
                      )
                ) THEN 'Woordvorm'
                WHEN lower(v.headword) LIKE v_like_query THEN 'Samenstelling'
                WHEN lower(COALESCE(v.raw#>>'{example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,example}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{translation,text}', '')) LIKE v_like_query
                    THEN 'In voorbeeld'
                WHEN lower(COALESCE(v.raw#>>'{definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{meanings,0,context}', '')) LIKE v_like_query
                  OR lower(COALESCE(v.raw#>>'{notes}', '')) LIKE v_like_query
                    THEN 'In betekenis'
                ELSE 'Bladeren'
            END AS search_match_label,
            CASE
                WHEN v.dictionary_kind = 'user' AND v.owner_user_id = v_user_id THEN 0
                WHEN v.dictionary_kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank,
            CASE
                WHEN v_query IS NULL THEN 0
                WHEN lower(v.headword) = v_query THEN 0
                WHEN lower(v.headword) LIKE v_query || '%' THEN 1
                WHEN lower(v.headword) LIKE v_like_query THEN 2
                ELSE 3
            END AS headword_rank
        FROM visible_entries v
    )
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_items
    FROM (
        SELECT
            id,
            dictionary_id,
            dictionary_name,
            dictionary_slug,
            dictionary_kind,
            language_code,
            headword,
            part_of_speech,
            gender,
            raw,
            is_nt2_2000,
            search_group_rank,
            search_match_group,
            search_match_label,
            NULL::text AS search_matched_text
        FROM ranked_entries
        WHERE search_group_rank IS NOT NULL
        ORDER BY search_group_rank ASC, dictionary_rank ASC, headword_rank ASC, lower(headword) ASC, meaning_id ASC
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

GRANT EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int) TO authenticated;
