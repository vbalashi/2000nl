-- Versioned dictionary search over extracted search documents. Existing UI
-- search remains on search_word_entries_gated until this v2 path is backfilled
-- and validated in production.

CREATE OR REPLACE FUNCTION search_dictionary_entries_v2(
    p_query text DEFAULT NULL,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20,
    p_include_body_matches boolean DEFAULT true,
    p_include_fallback boolean DEFAULT false
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
    v_query_unaccent text;
    v_like_query text;
    v_ts_query tsquery;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_list_type text := NULLIF(trim(COALESCE(p_list_type, '')), '');
    v_offset int;
    v_limit int;
    v_total int;
    v_max_allowed int;
    v_items jsonb;
    v_group_counts jsonb;
BEGIN
    v_user_id := (select auth.uid());
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'items', '[]'::jsonb,
            'total', 0,
            'group_counts', '{}'::jsonb,
            'is_locked', true,
            'max_allowed', 0
        );
    END IF;

    IF p_list_id IS NOT NULL
       AND COALESCE(v_list_type, 'curated') <> 'curated'
       AND NOT EXISTS (
            SELECT 1
            FROM user_word_lists
            WHERE id = p_list_id
              AND user_id = v_user_id
       ) THEN
        RETURN jsonb_build_object(
            'items', '[]'::jsonb,
            'total', 0,
            'group_counts', '{}'::jsonb,
            'is_locked', false,
            'max_allowed', NULL
        );
    END IF;

    v_tier := get_user_tier(v_user_id);
    v_raw_query := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);
    v_like_query := CASE WHEN v_query_unaccent IS NULL THEN NULL ELSE '%' || v_query_unaccent || '%' END;
    v_ts_query := CASE
        WHEN v_query_unaccent IS NULL THEN NULL
        ELSE plainto_tsquery('simple', v_query_unaccent)
    END;
    v_max_allowed := CASE WHEN v_tier IN ('premium', 'admin') THEN NULL ELSE 100 END;
    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);
    v_limit := GREATEST(p_page_size, 1);

    WITH accessible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.name, d.slug, d.kind, d.owner_user_id
        FROM dictionaries d
        WHERE can_access_dictionary(v_user_id, d.id, 'read')
    ),
    list_scope AS MATERIALIZED (
        SELECT li.word_id AS entry_id, COALESCE(li.rank, 999999)::int AS list_rank
        FROM word_list_items li
        WHERE p_list_id IS NOT NULL
          AND COALESCE(v_list_type, 'curated') = 'curated'
          AND li.list_id = p_list_id

        UNION ALL

        SELECT
            li.word_id AS entry_id,
            row_number() OVER (ORDER BY li.added_at DESC, li.word_id)::int AS list_rank
        FROM user_word_list_items li
        WHERE p_list_id IS NOT NULL
          AND COALESCE(v_list_type, 'curated') <> 'curated'
          AND li.list_id = p_list_id
    ),
    visible_entries AS MATERIALIZED (
        SELECT
            s.entry_id,
            s.dictionary_id,
            s.language_code,
            s.headword,
            s.meaning_id,
            s.part_of_speech,
            s.is_nt2_2000,
            s.normalized_headword,
            s.normalized_headword_unaccent,
            s.summary_definition,
            s.search_tsv,
            w.gender,
            w.raw,
            d.name AS dictionary_name,
            d.slug AS dictionary_slug,
            d.kind AS dictionary_kind,
            d.owner_user_id,
            ls.list_rank
        FROM dictionary_search_documents s
        JOIN word_entries w ON w.id = s.entry_id
        LEFT JOIN accessible_dictionaries d ON d.id = s.dictionary_id
        LEFT JOIN list_scope ls ON ls.entry_id = s.entry_id
        WHERE (s.dictionary_id IS NULL OR d.id IS NOT NULL)
          AND (p_list_id IS NULL OR ls.entry_id IS NOT NULL)
          AND (v_language_code IS NULL OR s.language_code = v_language_code)
          AND (array_length(v_dictionary_ids, 1) IS NULL OR s.dictionary_id = ANY(v_dictionary_ids))
          AND (p_part_of_speech IS NULL OR s.part_of_speech = p_part_of_speech)
          AND (p_is_nt2 IS NULL OR s.is_nt2_2000 = p_is_nt2)
    ),
    candidate_matches AS (
        SELECT
            entry_id,
            6 AS search_group_rank,
            0 AS match_specificity,
            1 AS field_weight,
            'fallback'::text AS search_match_group,
            'Bladeren'::text AS search_match_label,
            NULL::text AS search_matched_text,
            NULL::text AS search_matched_field,
            NULL::text AS search_source_path
        FROM visible_entries
        WHERE v_query IS NULL

        UNION ALL

        SELECT
            entry_id,
            1,
            CASE
                WHEN headword = v_raw_query THEN 0
                WHEN normalized_headword = v_query THEN 1
                ELSE 2
            END,
            100,
            'exact-headword',
            'Exacte match',
            headword,
            'headword',
            'dictionary_search_documents.normalized_headword'
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND (
            normalized_headword = v_query
            OR normalized_headword_unaccent = v_query_unaccent
          )

        UNION ALL

        SELECT
            v.entry_id,
            2,
            CASE
                WHEN f.field_group = 'form' AND f.normalized_text = v_query THEN 0
                WHEN f.field_group = 'form' AND f.normalized_text_unaccent = v_query_unaccent THEN 1
                ELSE 2
            END,
            f.field_weight,
            'lemma-or-inflection',
            CASE
                WHEN f.field_group = 'form' THEN 'Woordvorm'
                ELSE 'Alternatieve vorm'
            END,
            f.display_text,
            f.field_group,
            f.source_path
        FROM visible_entries v
        JOIN dictionary_search_fields f ON f.entry_id = v.entry_id
        WHERE v_query IS NOT NULL
          AND f.field_group IN ('form', 'alternate-headword')
          AND (
            f.normalized_text = v_query
            OR f.normalized_text_unaccent = v_query_unaccent
          )

        UNION ALL

        SELECT
            entry_id,
            3,
            CASE
                WHEN normalized_headword_unaccent LIKE v_query_unaccent || '%' THEN 0
                WHEN normalized_headword_unaccent LIKE '%' || v_query_unaccent THEN 1
                ELSE 2
            END,
            50,
            'related-headword',
            'Samenstelling',
            headword,
            'headword',
            'dictionary_search_documents.normalized_headword_unaccent'
        FROM visible_entries
        WHERE v_query IS NOT NULL
          AND normalized_headword_unaccent LIKE v_like_query

        UNION ALL

        SELECT
            v.entry_id,
            4,
            CASE WHEN f.field_tsv @@ v_ts_query THEN 0 ELSE 1 END,
            f.field_weight,
            CASE WHEN f.field_group = 'idiom' THEN 'idiom' ELSE 'example' END,
            CASE WHEN f.field_group = 'idiom' THEN 'In uitdrukking' ELSE 'In voorbeeld' END,
            f.display_text,
            f.field_group,
            f.source_path
        FROM visible_entries v
        JOIN dictionary_search_fields f ON f.entry_id = v.entry_id
        WHERE v_query IS NOT NULL
          AND p_include_body_matches
          AND f.field_group IN ('example', 'idiom')
          AND (
            f.normalized_text_unaccent LIKE v_like_query
            OR f.field_tsv @@ v_ts_query
          )

        UNION ALL

        SELECT
            v.entry_id,
            5,
            CASE WHEN f.field_tsv @@ v_ts_query THEN 0 ELSE 1 END,
            f.field_weight,
            'definition',
            'In betekenis',
            f.display_text,
            f.field_group,
            f.source_path
        FROM visible_entries v
        JOIN dictionary_search_fields f ON f.entry_id = v.entry_id
        WHERE v_query IS NOT NULL
          AND p_include_body_matches
          AND f.field_group IN ('definition', 'context', 'translation', 'note')
          AND (
            f.normalized_text_unaccent LIKE v_like_query
            OR f.field_tsv @@ v_ts_query
          )

        UNION ALL

        SELECT
            v.entry_id,
            6,
            0,
            f.field_weight,
            'fallback',
            'Brede match',
            f.display_text,
            f.field_group,
            f.source_path
        FROM visible_entries v
        JOIN dictionary_search_fields f ON f.entry_id = v.entry_id
        WHERE v_query IS NOT NULL
          AND p_include_fallback
          AND f.field_group = 'fallback'
          AND (
            f.normalized_text_unaccent LIKE v_like_query
            OR f.field_tsv @@ v_ts_query
          )
    ),
    ranked_matches AS MATERIALIZED (
        SELECT DISTINCT ON (entry_id)
            entry_id,
            search_group_rank,
            match_specificity,
            field_weight,
            search_match_group,
            search_match_label,
            search_matched_text,
            search_matched_field,
            search_source_path
        FROM candidate_matches
        ORDER BY entry_id, search_group_rank ASC, match_specificity ASC, field_weight DESC
    ),
    ranked_entries AS MATERIALIZED (
        SELECT
            v.*,
            m.search_group_rank,
            m.match_specificity,
            m.search_match_group,
            m.search_match_label,
            m.search_matched_text,
            m.search_matched_field,
            m.search_source_path,
            CASE
                WHEN v.dictionary_kind = 'user' AND v.owner_user_id = v_user_id THEN 0
                WHEN v.dictionary_kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank
        FROM visible_entries v
        JOIN ranked_matches m ON m.entry_id = v.entry_id
    ),
    total_count AS (
        SELECT COUNT(*)::int AS total
        FROM ranked_entries
    ),
    group_counts AS (
        SELECT COALESCE(jsonb_object_agg(search_match_group, count), '{}'::jsonb) AS counts
        FROM (
            SELECT search_match_group, COUNT(*)::int AS count
            FROM ranked_entries
            GROUP BY search_match_group
        ) grouped
    ),
    page_items AS (
        SELECT
            entry_id AS id,
            dictionary_id,
            dictionary_name,
            dictionary_slug,
            dictionary_kind,
            language_code,
            headword,
            meaning_id,
            part_of_speech,
            gender,
            raw,
            is_nt2_2000,
            search_group_rank,
            search_match_group,
            search_match_label,
            search_matched_text,
            search_matched_field,
            search_source_path
        FROM ranked_entries
        ORDER BY
            CASE
                WHEN v_query IS NULL AND p_list_id IS NOT NULL THEN COALESCE(list_rank, 999999)
                ELSE NULL
            END ASC NULLS LAST,
            search_group_rank ASC,
            match_specificity ASC,
            dictionary_rank ASC,
            lower(headword) ASC,
            meaning_id ASC,
            COALESCE(list_rank, 999999) ASC
        OFFSET v_offset LIMIT v_limit
    )
    SELECT
        total_count.total,
        group_counts.counts,
        COALESCE(jsonb_agg(row_to_json(page_items)::jsonb) FILTER (WHERE page_items.id IS NOT NULL), '[]'::jsonb)
    INTO v_total, v_group_counts, v_items
    FROM total_count
    CROSS JOIN group_counts
    LEFT JOIN page_items ON true
    GROUP BY total_count.total, group_counts.counts;

    v_total := COALESCE(v_total, 0);
    v_group_counts := COALESCE(v_group_counts, '{}'::jsonb);

    IF v_max_allowed IS NOT NULL AND v_offset >= v_max_allowed THEN
        RETURN jsonb_build_object(
            'items', '[]'::jsonb,
            'total', v_total,
            'group_counts', v_group_counts,
            'is_locked', true,
            'max_allowed', v_max_allowed,
            'query_normalization', jsonb_build_object(
                'query', v_raw_query,
                'normalized', v_query,
                'normalized_unaccent', v_query_unaccent
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'items', COALESCE(v_items, '[]'::jsonb),
        'total', v_total,
        'group_counts', v_group_counts,
        'is_locked', v_max_allowed IS NOT NULL AND v_total > v_max_allowed,
        'max_allowed', v_max_allowed,
        'query_normalization', jsonb_build_object(
            'query', v_raw_query,
            'normalized', v_query,
            'normalized_unaccent', v_query_unaccent
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION lookup_dictionary_entries_v2(
    p_query text,
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
    v_raw_query text;
    v_query text;
    v_query_unaccent text;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_resolved_entry_id uuid;
    v_resolved_headword text;
    v_resolved_language_code text;
    v_resolved_by text;
    v_matched_text text;
    v_items jsonb;
BEGIN
    v_user_id := (select auth.uid());
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('query', p_query, 'resolution', NULL, 'items', '[]'::jsonb);
    END IF;

    v_raw_query := NULLIF(trim(COALESCE(p_query, '')), '');
    IF v_raw_query IS NULL THEN
        RETURN jsonb_build_object('query', p_query, 'resolution', NULL, 'items', '[]'::jsonb);
    END IF;

    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);

    WITH accessible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.kind, d.owner_user_id
        FROM dictionaries d
        WHERE can_access_dictionary(v_user_id, d.id, 'read')
    ),
    visible_docs AS MATERIALIZED (
        SELECT
            s.*,
            ad.kind AS dictionary_kind,
            ad.owner_user_id
        FROM dictionary_search_documents s
        LEFT JOIN accessible_dictionaries ad ON ad.id = s.dictionary_id
        WHERE (s.dictionary_id IS NULL OR ad.id IS NOT NULL)
          AND (v_language_code IS NULL OR s.language_code = v_language_code)
          AND (array_length(v_dictionary_ids, 1) IS NULL OR s.dictionary_id = ANY(v_dictionary_ids))
    ),
    candidates AS (
        SELECT
            entry_id,
            headword,
            language_code,
            'exact-headword'::text AS resolved_by,
            headword AS matched_text,
            CASE WHEN headword = v_raw_query THEN 0 ELSE 1 END AS rank
        FROM visible_docs
        WHERE normalized_headword = v_query

        UNION ALL

        SELECT
            entry_id,
            headword,
            language_code,
            'normalized-headword',
            headword,
            2
        FROM visible_docs
        WHERE normalized_headword_unaccent = v_query_unaccent

        UNION ALL

        SELECT
            d.entry_id,
            d.headword,
            d.language_code,
            'word-form',
            f.display_text,
            3
        FROM visible_docs d
        JOIN dictionary_search_fields f ON f.entry_id = d.entry_id
        WHERE f.field_group = 'form'
          AND (
            f.normalized_text = v_query
            OR f.normalized_text_unaccent = v_query_unaccent
          )
    )
    SELECT entry_id, headword, language_code, resolved_by, matched_text
    INTO v_resolved_entry_id, v_resolved_headword, v_resolved_language_code, v_resolved_by, v_matched_text
    FROM candidates
    ORDER BY rank ASC, lower(headword) ASC
    LIMIT 1;

    IF v_resolved_entry_id IS NULL THEN
        RETURN jsonb_build_object(
            'query', v_raw_query,
            'resolution', jsonb_build_object(
                'resolved_by', NULL,
                'normalized', v_query,
                'normalized_unaccent', v_query_unaccent
            ),
            'items', '[]'::jsonb
        );
    END IF;

    WITH accessible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.name, d.slug, d.kind, d.owner_user_id
        FROM dictionaries d
        WHERE can_access_dictionary(v_user_id, d.id, 'read')
    ),
    candidates AS (
        SELECT
            w.*,
            d.name AS dictionary_name,
            d.slug AS dictionary_slug,
            d.kind AS dictionary_kind,
            d.owner_user_id,
            COUNT(*) OVER (
                PARTITION BY w.dictionary_id, w.language_code, w.headword
            ) AS meanings_count,
            CASE
                WHEN d.kind = 'user' AND d.owner_user_id = v_user_id THEN 0
                WHEN d.kind = 'curated' THEN 1
                ELSE 2
            END AS dictionary_rank
        FROM word_entries w
        JOIN dictionary_search_documents s ON s.entry_id = w.id
        LEFT JOIN accessible_dictionaries d ON d.id = w.dictionary_id
        WHERE s.language_code = v_resolved_language_code
          AND s.normalized_headword = normalize_dictionary_search_text(v_resolved_headword)
          AND (w.dictionary_id IS NULL OR d.id IS NOT NULL)
          AND (array_length(v_dictionary_ids, 1) IS NULL OR w.dictionary_id = ANY(v_dictionary_ids))
    ),
    payloads AS (
        SELECT jsonb_strip_nulls(jsonb_build_object(
            'id', id,
            'dictionary_id', dictionary_id,
            'dictionary_name', dictionary_name,
            'dictionary_slug', dictionary_slug,
            'dictionary_kind', dictionary_kind,
            'language_code', language_code,
            'headword', headword,
            'meaning_id', meaning_id,
            'part_of_speech', part_of_speech,
            'gender', gender,
            'raw', raw,
            'is_nt2_2000', is_nt2_2000,
            'meanings_count', COALESCE(meanings_count, 1)
        )) AS payload,
        dictionary_rank,
        meaning_id
        FROM candidates
    )
    SELECT COALESCE(jsonb_agg(payload ORDER BY dictionary_rank, meaning_id), '[]'::jsonb)
    INTO v_items
    FROM payloads;

    RETURN jsonb_build_object(
        'query', v_raw_query,
        'resolution', jsonb_build_object(
            'resolved_by', v_resolved_by,
            'normalized', v_query,
            'normalized_unaccent', v_query_unaccent,
            'resolved_headword', v_resolved_headword,
            'matched_text', v_matched_text
        ),
        'items', COALESCE(v_items, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION search_dictionary_entries_v2(text, text, uuid[], uuid, text, text, boolean, int, int, boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION lookup_dictionary_entries_v2(text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_dictionary_entries_v2(text, text, uuid[], uuid, text, text, boolean, int, int, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION lookup_dictionary_entries_v2(text, text, uuid[]) TO authenticated;
