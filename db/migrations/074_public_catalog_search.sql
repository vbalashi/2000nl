-- Guest-safe catalog search for external clients.
--
-- This mirrors the external-click search semantics used by authenticated lookup
-- while hard-limiting results to public catalog dictionaries.

CREATE OR REPLACE FUNCTION search_public_catalog_entries(
    p_query text DEFAULT NULL,
    p_language_code text DEFAULT NULL,
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
    v_raw_query text;
    v_query text;
    v_like_query text;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_offset int;
    v_limit int;
    v_total int;
    v_items jsonb;
BEGIN
    v_raw_query := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query := lower(v_raw_query);
    v_like_query := CASE WHEN v_query IS NULL THEN NULL ELSE '%' || v_query || '%' END;
    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);
    v_limit := GREATEST(p_page_size, 1);

    WITH public_dictionaries AS MATERIALIZED (
        SELECT
            d.id,
            d.language_code,
            d.slug,
            d.name,
            d.kind,
            d.visibility,
            d.owner_user_id,
            d.is_editable,
            d.schema_key,
            d.schema_version
        FROM dictionaries d
        WHERE d.visibility IN ('system', 'public')
    ),
    visible_entries AS MATERIALIZED (
        SELECT
            w.*,
            d.language_code AS dictionary_language_code,
            d.slug AS dictionary_slug,
            d.name AS dictionary_name,
            d.kind AS dictionary_kind,
            d.visibility AS dictionary_visibility,
            d.owner_user_id AS dictionary_owner_user_id,
            d.is_editable AS dictionary_is_editable,
            d.schema_key AS dictionary_schema_key,
            d.schema_version AS dictionary_schema_version
        FROM word_entries w
        JOIN public_dictionaries d ON d.id = w.dictionary_id
        WHERE (v_language_code IS NULL OR w.language_code = v_language_code)
    ),
    candidate_matches AS (
        SELECT id, 6 AS search_group_rank, 'fallback'::text AS search_match_group, 'Bladeren'::text AS search_match_label, NULL::text AS search_matched_text
        FROM visible_entries
        WHERE v_query IS NULL

        UNION ALL

        SELECT id, 1, 'exact-headword', 'Exacte match', headword
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND lower(headword) = v_query

        UNION ALL

        SELECT v.id, 2, 'lemma-or-inflection', 'Woordvorm', f.form
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

        SELECT id, 3, 'related-headword', 'Samenstelling', headword
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND lower(headword) LIKE v_like_query

        UNION ALL

        SELECT id, 4, 'example', 'In voorbeeld', NULL::text
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND (
            lower(COALESCE(raw#>>'{example}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,example}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,examples}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{translation,text}', '')) LIKE v_like_query
          )

        UNION ALL

        SELECT id, 5, 'definition', 'In betekenis', NULL::text
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND (
            lower(COALESCE(raw#>>'{definition}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,definition}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{meanings,0,context}', '')) LIKE v_like_query
            OR lower(COALESCE(raw#>>'{notes}', '')) LIKE v_like_query
          )

        UNION ALL

        SELECT id, 6, 'fallback', 'Bladeren', NULL::text
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND lower(raw::text) LIKE v_like_query
    ),
    ranked_matches AS (
        SELECT DISTINCT ON (id)
            id,
            search_group_rank,
            search_match_group,
            search_match_label,
            search_matched_text
        FROM candidate_matches
        ORDER BY id, search_group_rank ASC
    ),
    ranked_entries AS MATERIALIZED (
        SELECT
            v.*,
            m.search_group_rank,
            m.search_match_group,
            m.search_match_label,
            m.search_matched_text,
            CASE
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
            language_code,
            headword,
            meaning_id,
            part_of_speech,
            gender,
            raw,
            is_nt2_2000,
            NULL::int AS meanings_count,
            jsonb_build_object(
                'id', dictionary_id,
                'language_code', dictionary_language_code,
                'slug', dictionary_slug,
                'name', dictionary_name,
                'kind', dictionary_kind,
                'visibility', dictionary_visibility,
                'owner_user_id', dictionary_owner_user_id,
                'is_editable', dictionary_is_editable,
                'schema_key', dictionary_schema_key,
                'schema_version', dictionary_schema_version
            ) AS dictionary,
            dictionary_name,
            dictionary_slug,
            dictionary_kind,
            search_group_rank,
            search_match_group,
            search_match_label,
            search_matched_text
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

    RETURN jsonb_build_object(
        'items', COALESCE(v_items, '[]'::jsonb),
        'total', COALESCE(v_total, 0)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION search_public_catalog_entries(text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_public_catalog_entries(text, text, int, int) TO service_role;
