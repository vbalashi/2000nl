-- Strict dictionary lookup RPCs for clicked-word cards.
--
-- These functions intentionally do not replace broad dictionary search. They
-- resolve exact/normalized headwords first, fall back to trusted word forms only
-- when no headword exists, and never scan examples, definitions, raw JSON, or
-- alphabetical neighbors.

CREATE OR REPLACE FUNCTION private.resolve_dictionary_lookup_candidates_v1(
    p_user_id uuid,
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_public_catalog boolean DEFAULT false,
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

    v_query := lower(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);

    RETURN QUERY
    WITH eligible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.kind, d.owner_user_id
        FROM dictionaries d
        WHERE CASE
            WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
            ELSE p_user_id IS NOT NULL AND can_access_dictionary(p_user_id, d.id, 'read')
        END
    ),
    headword_candidates AS MATERIALIZED (
        SELECT
            w.id AS entry_id,
            'exact-headword'::text AS resolved_by,
            w.headword AS matched_text,
            1 AS tier_rank,
            CASE
                WHEN w.headword = v_raw_query THEN 0
                WHEN lower(w.headword) = v_query THEN 1
                ELSE 2
            END AS match_rank,
            w.headword,
            w.meaning_id,
            w.dictionary_id
        FROM word_entries w
        JOIN eligible_dictionaries d ON d.id = w.dictionary_id
        WHERE (v_language_code IS NULL OR w.language_code = v_language_code)
          AND (array_length(v_dictionary_ids, 1) IS NULL OR w.dictionary_id = ANY(v_dictionary_ids))
          AND (
              lower(w.headword) = v_query
              OR normalize_dictionary_search_text_unaccent(w.headword) = v_query_unaccent
          )
        ORDER BY
            CASE
                WHEN w.headword = v_raw_query THEN 0
                WHEN lower(w.headword) = v_query THEN 1
                ELSE 2
            END ASC,
            lower(w.headword) ASC,
            w.meaning_id ASC,
            w.id ASC
        LIMIT v_limit
    ),
    form_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (w.id)
            w.id AS entry_id,
            'lemma-or-inflection'::text AS resolved_by,
            f.form AS matched_text,
            2 AS tier_rank,
            CASE
                WHEN f.form = v_raw_query THEN 0
                WHEN lower(f.form) = v_query THEN 1
                ELSE 2
            END AS match_rank,
            w.headword,
            w.meaning_id,
            w.dictionary_id
        FROM word_forms f
        JOIN word_entries w ON w.id = f.word_id
        JOIN eligible_dictionaries d ON d.id = w.dictionary_id
        WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND (v_language_code IS NULL OR f.language_code = v_language_code)
          AND f.language_code = w.language_code
          AND (
              (f.dictionary_id IS NULL AND w.dictionary_id IS NULL)
              OR f.dictionary_id = w.dictionary_id
          )
          AND (array_length(v_dictionary_ids, 1) IS NULL OR w.dictionary_id = ANY(v_dictionary_ids))
          AND (
              lower(f.form) = v_query
              OR normalize_dictionary_search_text_unaccent(f.form) = v_query_unaccent
          )
        ORDER BY
            w.id,
            CASE
                WHEN f.form = v_raw_query THEN 0
                WHEN lower(f.form) = v_query THEN 1
                ELSE 2
            END ASC,
            lower(f.form) ASC
    )
    SELECT *
    FROM (
        SELECT * FROM headword_candidates
        UNION ALL
        SELECT * FROM form_candidates
    ) c
    ORDER BY c.tier_rank ASC, c.match_rank ASC, lower(c.headword) ASC, c.meaning_id ASC, c.entry_id ASC
    LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION lookup_dictionary_entries_v3(
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_user_id uuid;
    v_raw_query text;
    v_query text;
    v_query_unaccent text;
    v_items jsonb;
    v_total int;
    v_resolved_by text;
BEGIN
    v_user_id := (select auth.uid());
    v_raw_query := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);

    IF v_user_id IS NULL OR v_raw_query IS NULL THEN
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

    WITH resolved AS MATERIALIZED (
        SELECT *
        FROM private.resolve_dictionary_lookup_candidates_v1(
            v_user_id,
            v_raw_query,
            p_language_code,
            p_dictionary_ids,
            false,
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
                WHEN d.kind = 'user' AND d.owner_user_id = v_user_id THEN 0
                WHEN d.kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank
        FROM resolved r
        JOIN word_entries w ON w.id = r.entry_id
        JOIN dictionaries d ON d.id = w.dictionary_id
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
            lower(h.headword) AS sort_headword,
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
    v_items jsonb;
    v_total int;
    v_resolved_by text;
BEGIN
    v_raw_query := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);

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

    WITH resolved AS MATERIALIZED (
        SELECT *
        FROM private.resolve_dictionary_lookup_candidates_v1(
            NULL,
            v_raw_query,
            p_language_code,
            NULL,
            true,
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
            lower(h.headword) AS sort_headword,
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

REVOKE EXECUTE ON FUNCTION private.resolve_dictionary_lookup_candidates_v1(uuid, text, text, uuid[], boolean, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lookup_dictionary_entries_v3(text, text, uuid[], int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION lookup_public_catalog_entries_v1(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lookup_dictionary_entries_v3(text, text, uuid[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION lookup_public_catalog_entries_v1(text, text, int) TO service_role;
