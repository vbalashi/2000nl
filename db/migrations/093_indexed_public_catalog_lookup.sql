-- Speed up public clicked-word lookup by resolving candidate IDs through the
-- dictionary search projection. Authenticated lookup stays on the legacy
-- resolver until user-entry search-projection freshness is verified end to end.

CREATE OR REPLACE FUNCTION private.resolve_public_dictionary_lookup_candidates_indexed_v1(
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_limit int DEFAULT 10
)
RETURNS TABLE (
    entry_id uuid,
    resolved_by text,
    matched_text text,
    tier_rank int,
    match_rank int,
    headword text,
    meaning_id int,
    dictionary_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query text;
    v_query_unaccent text;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_limit int := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
BEGIN
    IF v_raw_query IS NULL THEN
        RETURN;
    END IF;

    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);

    RETURN QUERY
    WITH eligible_dictionaries AS MATERIALIZED (
        SELECT d.id
        FROM dictionaries d
        WHERE d.visibility IN ('system', 'public')
          AND (array_length(v_dictionary_ids, 1) IS NULL OR d.id = ANY(v_dictionary_ids))
    ),
    headword_candidates AS MATERIALIZED (
        SELECT *
        FROM (
            SELECT
                s.entry_id,
                'exact-headword'::text AS resolved_by,
                s.headword AS matched_text,
                1 AS tier_rank,
                CASE
                    WHEN s.headword = v_raw_query THEN 0
                    WHEN s.normalized_headword = v_query THEN 1
                    ELSE 2
                END AS match_rank,
                s.headword,
                s.meaning_id,
                s.dictionary_id
            FROM dictionary_search_documents s
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE (v_language_code IS NULL OR s.language_code = v_language_code)
              AND s.normalized_headword = v_query

            UNION ALL

            SELECT
                s.entry_id,
                'exact-headword'::text AS resolved_by,
                s.headword AS matched_text,
                1 AS tier_rank,
                CASE
                    WHEN s.headword = v_raw_query THEN 0
                    WHEN s.normalized_headword = v_query THEN 1
                    ELSE 2
                END AS match_rank,
                s.headword,
                s.meaning_id,
                s.dictionary_id
            FROM dictionary_search_documents s
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE (v_language_code IS NULL OR s.language_code = v_language_code)
              AND s.normalized_headword_unaccent = v_query_unaccent
              AND s.normalized_headword <> v_query
        ) headword_matches
        ORDER BY
            headword_matches.match_rank ASC,
            normalize_dictionary_search_text(headword_matches.headword) ASC,
            headword_matches.meaning_id ASC,
            headword_matches.entry_id ASC
        LIMIT v_limit
    ),
    form_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (form_matches.entry_id)
            form_matches.entry_id,
            form_matches.resolved_by,
            form_matches.matched_text,
            form_matches.tier_rank,
            form_matches.match_rank,
            form_matches.headword,
            form_matches.meaning_id,
            form_matches.dictionary_id
        FROM (
            SELECT
                s.entry_id,
                'lemma-or-inflection'::text AS resolved_by,
                f.display_text AS matched_text,
                2 AS tier_rank,
                CASE
                    WHEN f.display_text = v_raw_query THEN 0
                    WHEN f.normalized_text = v_query THEN 1
                    ELSE 2
                END AS match_rank,
                s.headword,
                s.meaning_id,
                s.dictionary_id
            FROM dictionary_search_fields f
            JOIN dictionary_search_documents s ON s.entry_id = f.entry_id
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
              AND f.field_group = 'form'
              AND (v_language_code IS NULL OR f.language_code = v_language_code)
              AND f.normalized_text = v_query

            UNION ALL

            SELECT
                s.entry_id,
                'lemma-or-inflection'::text AS resolved_by,
                f.display_text AS matched_text,
                2 AS tier_rank,
                CASE
                    WHEN f.display_text = v_raw_query THEN 0
                    WHEN f.normalized_text = v_query THEN 1
                    ELSE 2
                END AS match_rank,
                s.headword,
                s.meaning_id,
                s.dictionary_id
            FROM dictionary_search_fields f
            JOIN dictionary_search_documents s ON s.entry_id = f.entry_id
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
              AND f.field_group = 'form'
              AND (v_language_code IS NULL OR f.language_code = v_language_code)
              AND f.normalized_text_unaccent = v_query_unaccent
              AND f.normalized_text <> v_query
        ) form_matches
        ORDER BY
            form_matches.entry_id,
            form_matches.match_rank ASC,
            normalize_dictionary_search_text(form_matches.matched_text) ASC
    )
    SELECT *
    FROM (
        SELECT * FROM headword_candidates
        UNION ALL
        SELECT * FROM form_candidates
    ) c
    ORDER BY
        c.tier_rank ASC,
        c.match_rank ASC,
        normalize_dictionary_search_text(c.headword) ASC,
        c.meaning_id ASC,
        c.entry_id ASC
    LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION lookup_public_catalog_entries_v1(
    p_query text,
    p_language_code text DEFAULT NULL,
    p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_raw_query text;
    v_query text;
    v_query_unaccent text;
    v_language_code text;
    v_items jsonb;
    v_total int;
    v_resolved_by text;
    v_public_entry_exists boolean;
    v_search_document_exists boolean;
BEGIN
    v_raw_query := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);
    v_language_code := NULLIF(trim(COALESCE(p_language_code, '')), '');

    IF v_raw_query IS NULL THEN
        RETURN jsonb_build_object(
            'query', p_query,
            'resolution', jsonb_build_object(
                'resolved_by', NULL,
                'normalized', v_query,
                'normalized_unaccent', v_query_unaccent
            ),
            'items', '[]'::jsonb,
            'total', 0
        );
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM word_entries w
        JOIN dictionaries d ON d.id = w.dictionary_id
        WHERE d.visibility IN ('system', 'public')
          AND (v_language_code IS NULL OR w.language_code = v_language_code)
        LIMIT 1
    )
    INTO v_public_entry_exists;

    SELECT EXISTS (
        SELECT 1
        FROM dictionary_search_documents s
        JOIN dictionaries d ON d.id = s.dictionary_id
        WHERE d.visibility IN ('system', 'public')
          AND (v_language_code IS NULL OR s.language_code = v_language_code)
        LIMIT 1
    )
    INTO v_search_document_exists;

    IF v_public_entry_exists AND NOT v_search_document_exists THEN
        RETURN jsonb_build_object(
            'error', 'search_index_not_ready',
            'query', v_raw_query,
            'resolution', jsonb_build_object(
                'resolved_by', NULL,
                'normalized', v_query,
                'normalized_unaccent', v_query_unaccent
            ),
            'items', '[]'::jsonb,
            'total', 0
        );
    END IF;

    WITH resolved AS MATERIALIZED (
        SELECT *
        FROM private.resolve_public_dictionary_lookup_candidates_indexed_v1(
            v_raw_query,
            p_language_code,
            NULL,
            p_limit
        )
    ),
    hydrated AS (
        SELECT
            w.*,
            r.resolved_by,
            r.matched_text,
            r.tier_rank,
            r.match_rank,
            d.name AS dictionary_name,
            d.slug AS dictionary_slug,
            d.kind AS dictionary_kind,
            d.visibility AS dictionary_visibility,
            d.owner_user_id AS dictionary_owner_user_id,
            d.is_editable AS dictionary_is_editable,
            d.schema_key AS dictionary_schema_key,
            d.schema_version AS dictionary_schema_version,
            d.language_code AS dictionary_language_code,
            COUNT(*) OVER (
                PARTITION BY w.dictionary_id, w.language_code, w.headword
            ) AS meanings_count,
            CASE
                WHEN d.kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank
        FROM resolved r
        JOIN word_entries w ON w.id = r.entry_id
        JOIN dictionaries d ON d.id = w.dictionary_id
        WHERE d.visibility IN ('system', 'public')
    ),
    payloads AS (
        SELECT
            jsonb_strip_nulls(jsonb_build_object(
                'id', h.id,
                'dictionary_id', h.dictionary_id,
                'language_code', h.language_code,
                'headword', h.headword,
                'meaning_id', h.meaning_id,
                'part_of_speech', h.part_of_speech,
                'gender', h.gender,
                'raw', h.raw,
                'is_nt2_2000', h.is_nt2_2000,
                'meanings_count', COALESCE(h.meanings_count, 1),
                'dictionary', jsonb_build_object(
                    'id', h.dictionary_id,
                    'language_code', h.dictionary_language_code,
                    'slug', h.dictionary_slug,
                    'name', h.dictionary_name,
                    'kind', h.dictionary_kind,
                    'visibility', h.dictionary_visibility,
                    'owner_user_id', h.dictionary_owner_user_id,
                    'is_editable', h.dictionary_is_editable,
                    'schema_key', h.dictionary_schema_key,
                    'schema_version', h.dictionary_schema_version
                ),
                'dictionary_name', h.dictionary_name,
                'dictionary_slug', h.dictionary_slug,
                'dictionary_kind', h.dictionary_kind,
                'search_match_group', h.resolved_by,
                'search_matched_text', h.matched_text
            )) AS payload,
            h.tier_rank,
            h.match_rank,
            h.dictionary_rank,
            h.resolved_by,
            normalize_dictionary_search_text(h.headword) AS sort_headword,
            h.meaning_id,
            h.id
        FROM hydrated h
    )
    SELECT
        COUNT(*)::int,
        COALESCE(
            jsonb_agg(
                payload
                ORDER BY tier_rank, match_rank, dictionary_rank, sort_headword, meaning_id, id
            ),
            '[]'::jsonb
        ),
        (array_agg(resolved_by ORDER BY tier_rank, match_rank, dictionary_rank, sort_headword, meaning_id, id))[1]
    INTO v_total, v_items, v_resolved_by
    FROM payloads;

    RETURN jsonb_build_object(
        'query', v_raw_query,
        'resolution', jsonb_build_object(
            'resolved_by', v_resolved_by,
            'normalized', v_query,
            'normalized_unaccent', v_query_unaccent
        ),
        'items', COALESCE(v_items, '[]'::jsonb),
        'total', COALESCE(v_total, 0)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.resolve_public_dictionary_lookup_candidates_indexed_v1(text, text, uuid[], int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lookup_public_catalog_entries_v1(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lookup_public_catalog_entries_v1(text, text, int) TO service_role;
