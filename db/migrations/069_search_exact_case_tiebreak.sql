-- Prefer the exact typed headword casing inside exact case-insensitive matches.
-- Example: query "ster" should rank the noun "ster" before the abbreviation "STER".

CREATE OR REPLACE FUNCTION search_word_entries_gated(
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL
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
    v_raw_query text;
    v_query text;
    v_like_query text;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
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
    v_raw_query := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query := lower(v_raw_query);
    v_like_query := CASE WHEN v_query IS NULL THEN NULL ELSE '%' || v_query || '%' END;
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);
    v_limit := GREATEST(p_page_size, 1);

    WITH accessible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.name, d.slug, d.kind, d.owner_user_id
        FROM dictionaries d
        WHERE can_access_dictionary(v_user_id, d.id, 'read')
    ),
    visible_entries AS MATERIALIZED (
        SELECT
            w.*,
            d.name AS dictionary_name,
            d.slug AS dictionary_slug,
            d.kind AS dictionary_kind,
            d.owner_user_id
        FROM word_entries w
        LEFT JOIN accessible_dictionaries d ON d.id = w.dictionary_id
        WHERE (w.dictionary_id IS NULL OR d.id IS NOT NULL)
          AND (v_language_code IS NULL OR w.language_code = v_language_code)
          AND (array_length(v_dictionary_ids, 1) IS NULL OR w.dictionary_id = ANY(v_dictionary_ids))
          AND (p_part_of_speech IS NULL OR w.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR w.is_nt2_2000 = p_is_nt2)
          AND (p_filter_hidden IS NULL OR p_filter_hidden = false
               OR EXISTS (
                    SELECT 1
                    FROM user_card_status s
                    WHERE s.user_id = v_user_id
                      AND s.entry_id = w.id
                      AND COALESCE(s.hidden, false) = true
               ))
          AND (p_filter_frozen IS NULL OR p_filter_frozen = false
               OR EXISTS (
                    SELECT 1
                    FROM user_card_status s
                    WHERE s.user_id = v_user_id
                      AND s.entry_id = w.id
                      AND s.frozen_until IS NOT NULL
                      AND s.frozen_until > now()
               ))
    ),
    candidate_matches AS (
        SELECT id, 6 AS search_group_rank, 'fallback'::text AS search_match_group, 'Bladeren'::text AS search_match_label
        FROM visible_entries
        WHERE v_query IS NULL

        UNION ALL

        SELECT id, 1, 'exact-headword', 'Exacte match'
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND lower(headword) = v_query

        UNION ALL

        SELECT v.id, 2, 'lemma-or-inflection', 'Woordvorm'
        FROM visible_entries v
        JOIN word_forms f ON f.word_id = v.id
        WHERE v_query IS NOT NULL
          AND f.language_code = v.language_code
          AND lower(f.form) = v_query
          AND (
            (f.dictionary_id IS NULL AND v.dictionary_id IS NULL)
            OR f.dictionary_id = v.dictionary_id
          )

        UNION ALL

        SELECT id, 3, 'related-headword', 'Samenstelling'
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND lower(headword) LIKE v_like_query

        UNION ALL

        SELECT id, 4, 'example', 'In voorbeeld'
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND (
            lower(COALESCE(raw#>>'{example}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,example}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{translation,text}', '')) LIKE v_like_query
          )

        UNION ALL

        SELECT id, 5, 'definition', 'In betekenis'
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND (
            lower(COALESCE(raw#>>'{definition}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,context}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{notes}', '')) LIKE v_like_query
          )

        UNION ALL

        SELECT id, 6, 'fallback', 'Bladeren'
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND lower(raw::text) LIKE v_like_query
    ),
    ranked_matches AS (
        SELECT DISTINCT ON (id)
            id,
            search_group_rank,
            search_match_group,
            search_match_label
        FROM candidate_matches
        ORDER BY id, search_group_rank ASC
    ),
    ranked_entries AS MATERIALIZED (
        SELECT
            v.*,
            m.search_group_rank,
            m.search_match_group,
            m.search_match_label,
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
            END AS headword_rank,
            CASE
                WHEN v_raw_query IS NULL THEN 0
                WHEN v.headword = v_raw_query THEN 0
                WHEN lower(v.headword) = v_query THEN 1
                ELSE 2
            END AS exact_case_rank
        FROM visible_entries v
        JOIN ranked_matches m ON m.id = v.id
    ),
    total_count AS (
        SELECT COUNT(*)::int AS total
        FROM ranked_entries
    ),
    page_items AS (
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
        ORDER BY search_group_rank ASC, dictionary_rank ASC, headword_rank ASC, exact_case_rank ASC, lower(headword) ASC, meaning_id ASC
        OFFSET v_offset LIMIT v_limit
    )
    SELECT
        total_count.total,
        COALESCE(jsonb_agg(row_to_json(page_items)::jsonb) FILTER (WHERE page_items.id IS NOT NULL), '[]'::jsonb)
    INTO v_total, v_items
    FROM total_count
    LEFT JOIN page_items ON true
    GROUP BY total_count.total;

    v_total := COALESCE(v_total, 0);

    IF v_max_allowed IS NOT NULL AND v_offset >= v_max_allowed THEN
        RETURN jsonb_build_object('items', '[]'::jsonb, 'total', v_total, 'is_locked', true, 'max_allowed', v_max_allowed);
    END IF;

    RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'is_locked', v_max_allowed IS NOT NULL AND v_total > v_max_allowed,
        'max_allowed', v_max_allowed
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_word_entries_gated(text, text, boolean, boolean, boolean, int, int, text, uuid[]) TO authenticated;
