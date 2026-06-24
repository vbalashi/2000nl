-- Bound the remaining grouped-search hot paths for common queries.
--
-- Headwords now use exact indexed headword probes and only fall back to trusted
-- forms when no headword candidate exists. Examples/definitions page field keys
-- first, hydrate only visible rows, and avoid blocking exact counts.

CREATE OR REPLACE FUNCTION private.search_dictionary_headwords_group_v1(
    p_user_id uuid,
    p_public_catalog boolean,
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_limit int DEFAULT 6,
    p_cursor text DEFAULT NULL
)
RETURNS jsonb
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
    v_limit int := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 100);
    v_cursor jsonb := private.decode_dictionary_search_cursor_v1(p_cursor);
    v_items jsonb := '[]'::jsonb;
    v_total int := 0;
    v_has_more boolean := false;
    v_next_cursor text := NULL;
    v_last jsonb;
BEGIN
    IF v_raw_query IS NULL THEN
        RETURN jsonb_build_object(
            'id', 'headwords',
            'total', 0,
            'count', jsonb_build_object('value', 0, 'relation', 'eq'),
            'items', '[]'::jsonb,
            'page', jsonb_build_object('limit', v_limit, 'nextCursor', NULL, 'hasMore', false)
        );
    END IF;

    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);

    WITH eligible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.slug, d.name, d.kind
        FROM dictionaries d
        WHERE CASE
            WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
            ELSE p_user_id IS NOT NULL AND can_access_dictionary(p_user_id, d.id, 'read')
        END
          AND (array_length(v_dictionary_ids, 1) IS NULL OR d.id = ANY(v_dictionary_ids))
    ),
    headword_candidates AS MATERIALIZED (
        SELECT *
        FROM (
            SELECT
                s.entry_id,
                s.dictionary_id,
                s.language_code,
                s.headword,
                s.meaning_id,
                s.part_of_speech,
                s.summary_definition,
                s.normalized_headword,
                ed.slug AS dictionary_slug,
                ed.name AS dictionary_name,
                ed.kind AS dictionary_kind,
                'exact'::text AS relation,
                s.headword AS matched_text,
                'dictionary_search_documents.headword'::text AS source_path,
                CASE
                    WHEN s.headword = v_raw_query THEN 0
                    WHEN s.normalized_headword = v_query THEN 1
                    ELSE 2
                END AS rank
            FROM dictionary_search_documents s
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE (v_language_code IS NULL OR s.language_code = v_language_code)
              AND s.normalized_headword = v_query

            UNION ALL

            SELECT
                s.entry_id,
                s.dictionary_id,
                s.language_code,
                s.headword,
                s.meaning_id,
                s.part_of_speech,
                s.summary_definition,
                s.normalized_headword,
                ed.slug,
                ed.name,
                ed.kind,
                'exact',
                s.headword,
                'dictionary_search_documents.headword',
                CASE
                    WHEN s.headword = v_raw_query THEN 0
                    WHEN s.normalized_headword = v_query THEN 1
                    ELSE 2
                END AS rank
            FROM dictionary_search_documents s
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE (v_language_code IS NULL OR s.language_code = v_language_code)
              AND s.normalized_headword_unaccent = v_query_unaccent
              AND s.normalized_headword <> v_query
        ) matches
    ),
    form_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (entry_id)
            entry_id,
            dictionary_id,
            language_code,
            headword,
            meaning_id,
            part_of_speech,
            summary_definition,
            normalized_headword,
            dictionary_slug,
            dictionary_name,
            dictionary_kind,
            relation,
            matched_text,
            source_path,
            rank
        FROM (
            SELECT
                s.entry_id,
                s.dictionary_id,
                s.language_code,
                s.headword,
                s.meaning_id,
                s.part_of_speech,
                s.summary_definition,
                s.normalized_headword,
                ed.slug AS dictionary_slug,
                ed.name AS dictionary_name,
                ed.kind AS dictionary_kind,
                'inflection'::text AS relation,
                f.display_text AS matched_text,
                f.source_path,
                CASE
                    WHEN f.display_text = v_raw_query THEN 3
                    WHEN f.normalized_text = v_query THEN 4
                    ELSE 5
                END AS rank
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
                s.dictionary_id,
                s.language_code,
                s.headword,
                s.meaning_id,
                s.part_of_speech,
                s.summary_definition,
                s.normalized_headword,
                ed.slug,
                ed.name,
                ed.kind,
                'inflection',
                f.display_text,
                f.source_path,
                CASE
                    WHEN f.display_text = v_raw_query THEN 3
                    WHEN f.normalized_text = v_query THEN 4
                    ELSE 5
                END AS rank
            FROM dictionary_search_fields f
            JOIN dictionary_search_documents s ON s.entry_id = f.entry_id
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
              AND f.field_group = 'form'
              AND (v_language_code IS NULL OR f.language_code = v_language_code)
              AND f.normalized_text_unaccent = v_query_unaccent
              AND f.normalized_text <> v_query
        ) matches
        ORDER BY entry_id, rank, normalized_headword, meaning_id
    ),
    deduped AS MATERIALIZED (
        SELECT DISTINCT ON (entry_id) *
        FROM (
            SELECT * FROM headword_candidates
            UNION ALL
            SELECT * FROM form_candidates
        ) candidates
        ORDER BY entry_id, rank, normalized_headword, meaning_id
    ),
    counted AS (
        SELECT COUNT(*)::int AS total FROM deduped
    ),
    page_rows AS (
        SELECT *
        FROM deduped
        WHERE (v_cursor = '{}'::jsonb)
           OR (rank, normalized_headword, meaning_id, entry_id) >
              (
                COALESCE((v_cursor->>'rank')::int, -1),
                COALESCE(v_cursor->>'headwordSort', ''),
                COALESCE((v_cursor->>'meaningId')::int, -1),
                COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              )
        ORDER BY rank, normalized_headword, meaning_id, entry_id
        LIMIT v_limit + 1
    ),
    visible_page AS (
        SELECT *, row_number() OVER () AS rn FROM page_rows
    ),
    payloads AS (
        SELECT
            jsonb_build_object(
                'kind', 'entry',
                'entry', jsonb_strip_nulls(jsonb_build_object(
                    'id', entry_id,
                    'languageCode', language_code,
                    'headword', headword,
                    'meaningId', meaning_id,
                    'partOfSpeech', part_of_speech,
                    'summaryDefinition', summary_definition
                )),
                'dictionary', jsonb_strip_nulls(jsonb_build_object(
                    'id', dictionary_id,
                    'slug', dictionary_slug,
                    'name', dictionary_name,
                    'kind', dictionary_kind
                )),
                'match', jsonb_strip_nulls(jsonb_build_object(
                    'relation', relation,
                    'matchedText', matched_text,
                    'sourcePath', source_path
                ))
            ) AS payload,
            jsonb_build_object(
                'group', 'headwords',
                'rank', rank,
                'headwordSort', normalized_headword,
                'meaningId', meaning_id,
                'entryId', entry_id
            ) AS cursor_payload,
            rn
        FROM visible_page
        WHERE rn <= v_limit
    )
    SELECT
        counted.total,
        COALESCE(jsonb_agg(payload ORDER BY rn), '[]'::jsonb),
        EXISTS(SELECT 1 FROM visible_page WHERE rn > v_limit),
        (array_agg(cursor_payload ORDER BY rn DESC))[1]
    INTO v_total, v_items, v_has_more, v_last
    FROM counted
    LEFT JOIN payloads ON true
    GROUP BY counted.total;

    IF v_has_more AND v_last IS NOT NULL THEN
        v_next_cursor := private.encode_dictionary_search_cursor_v1(v_last);
    END IF;

    RETURN jsonb_build_object(
        'id', 'headwords',
        'total', COALESCE(v_total, 0),
        'count', jsonb_build_object('value', COALESCE(v_total, 0), 'relation', 'eq'),
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object('limit', v_limit, 'nextCursor', v_next_cursor, 'hasMore', COALESCE(v_has_more, false))
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.search_dictionary_body_group_v1(
    p_user_id uuid,
    p_public_catalog boolean,
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_group text DEFAULT 'examples',
    p_limit int DEFAULT 6,
    p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query_unaccent text;
    v_like_query text;
    v_ts_query tsquery;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_group text := COALESCE(NULLIF(trim(p_group), ''), 'examples');
    v_limit int := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 100);
    v_cursor jsonb := private.decode_dictionary_search_cursor_v1(p_cursor);
    v_items jsonb := '[]'::jsonb;
    v_has_more boolean := false;
    v_next_cursor text := NULL;
    v_last jsonb;
BEGIN
    IF v_raw_query IS NULL OR v_group NOT IN ('examples', 'definitions') THEN
        RETURN jsonb_build_object(
            'id', v_group,
            'total', NULL,
            'count', jsonb_build_object('value', NULL, 'relation', 'unknown'),
            'items', '[]'::jsonb,
            'page', jsonb_build_object('limit', v_limit, 'nextCursor', NULL, 'hasMore', false)
        );
    END IF;

    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);
    v_like_query := '%' || v_query_unaccent || '%';
    v_ts_query := plainto_tsquery('simple', v_query_unaccent);

    WITH eligible_dictionaries AS MATERIALIZED (
        SELECT d.id
        FROM dictionaries d
        WHERE CASE
            WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
            ELSE p_user_id IS NOT NULL AND can_access_dictionary(p_user_id, d.id, 'read')
        END
          AND (array_length(v_dictionary_ids, 1) IS NULL OR d.id = ANY(v_dictionary_ids))
    ),
    field_matches AS MATERIALIZED (
        SELECT *
        FROM (
            SELECT
                f.entry_id,
                f.dictionary_id,
                f.language_code,
                f.field_group,
                f.field_kind,
                f.display_text,
                f.source_path,
                f.meaning_ordinal,
                f.item_ordinal,
                0 AS rank
            FROM dictionary_search_fields f
            JOIN eligible_dictionaries ed ON ed.id = f.dictionary_id
            WHERE (v_language_code IS NULL OR f.language_code = v_language_code)
              AND f.extraction_version >= 2
              AND (
                  CASE
                      WHEN v_group = 'examples' THEN f.field_group IN ('example', 'idiom')
                      ELSE f.field_group IN ('definition', 'context', 'note')
                  END
              )
              AND f.field_tsv @@ v_ts_query

            UNION ALL

            SELECT
                f.entry_id,
                f.dictionary_id,
                f.language_code,
                f.field_group,
                f.field_kind,
                f.display_text,
                f.source_path,
                f.meaning_ordinal,
                f.item_ordinal,
                1 AS rank
            FROM dictionary_search_fields f
            JOIN eligible_dictionaries ed ON ed.id = f.dictionary_id
            WHERE length(v_query_unaccent) >= 3
              AND (v_language_code IS NULL OR f.language_code = v_language_code)
              AND f.extraction_version >= 2
              AND (
                  CASE
                      WHEN v_group = 'examples' THEN f.field_group IN ('example', 'idiom')
                      ELSE f.field_group IN ('definition', 'context', 'note')
                  END
              )
              AND f.normalized_text_unaccent LIKE v_like_query
              AND NOT (f.field_tsv @@ v_ts_query)
        ) matches
    ),
    page_fields AS MATERIALIZED (
        SELECT *
        FROM field_matches
        WHERE (v_cursor = '{}'::jsonb)
           OR (rank, meaning_ordinal, item_ordinal, entry_id, source_path) >
              (
                COALESCE((v_cursor->>'rank')::int, -1),
                COALESCE((v_cursor->>'meaningOrdinal')::int, -1),
                COALESCE((v_cursor->>'itemOrdinal')::int, -1),
                COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
                COALESCE(v_cursor->>'sourcePath', '')
              )
        ORDER BY rank, meaning_ordinal, item_ordinal, entry_id, source_path
        LIMIT v_limit + 1
    ),
    hydrated AS (
        SELECT
            p.*,
            s.headword,
            s.meaning_id,
            s.part_of_speech,
            s.summary_definition,
            d.slug AS dictionary_slug,
            d.name AS dictionary_name,
            d.kind AS dictionary_kind,
            row_number() OVER (ORDER BY p.rank, p.meaning_ordinal, p.item_ordinal, p.entry_id, p.source_path) AS rn
        FROM page_fields p
        JOIN dictionary_search_documents s ON s.entry_id = p.entry_id
        JOIN dictionaries d ON d.id = p.dictionary_id
    ),
    payloads AS (
        SELECT
            jsonb_build_object(
                'kind', 'field-match',
                'resultKey', entry_id::text || ':' || source_path,
                'entry', jsonb_strip_nulls(jsonb_build_object(
                    'id', entry_id,
                    'languageCode', language_code,
                    'headword', headword,
                    'meaningId', meaning_id,
                    'partOfSpeech', part_of_speech,
                    'summaryDefinition', summary_definition
                )),
                'dictionary', jsonb_strip_nulls(jsonb_build_object(
                    'id', dictionary_id,
                    'slug', dictionary_slug,
                    'name', dictionary_name,
                    'kind', dictionary_kind
                )),
                'field', jsonb_strip_nulls(jsonb_build_object(
                    'kind', COALESCE(field_kind, field_group),
                    'group', field_group,
                    'sourcePath', source_path,
                    'text', display_text
                )),
                'match', jsonb_build_object('matchedText', v_raw_query)
            ) AS payload,
            jsonb_build_object(
                'group', v_group,
                'rank', rank,
                'meaningOrdinal', meaning_ordinal,
                'itemOrdinal', item_ordinal,
                'entryId', entry_id,
                'sourcePath', source_path
            ) AS cursor_payload,
            rn
        FROM hydrated
        WHERE rn <= v_limit
    )
    SELECT
        COALESCE(jsonb_agg(payload ORDER BY rn), '[]'::jsonb),
        EXISTS(SELECT 1 FROM hydrated WHERE rn > v_limit),
        (array_agg(cursor_payload ORDER BY rn DESC))[1]
    INTO v_items, v_has_more, v_last
    FROM payloads;

    IF v_has_more AND v_last IS NOT NULL THEN
        v_next_cursor := private.encode_dictionary_search_cursor_v1(v_last);
    END IF;

    RETURN jsonb_build_object(
        'id', v_group,
        'total', NULL,
        'count', jsonb_build_object('value', NULL, 'relation', 'unknown'),
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object('limit', v_limit, 'nextCursor', v_next_cursor, 'hasMore', COALESCE(v_has_more, false))
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.search_dictionary_group_keyset_v1(
    p_user_id uuid,
    p_public_catalog boolean,
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_group text DEFAULT 'headwords',
    p_limit int DEFAULT 6,
    p_cursor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
STABLE
AS $$
DECLARE
    v_group text := COALESCE(NULLIF(trim(p_group), ''), 'headwords');
BEGIN
    IF v_group = 'headwords' THEN
        RETURN private.search_dictionary_headwords_group_v1(
            p_user_id, p_public_catalog, p_query, p_language_code, p_dictionary_ids, p_limit, p_cursor
        );
    END IF;

    IF v_group IN ('examples', 'definitions') THEN
        RETURN private.search_dictionary_body_group_v1(
            p_user_id, p_public_catalog, p_query, p_language_code, p_dictionary_ids, v_group, p_limit, p_cursor
        );
    END IF;

    IF v_group = 'alphabetical' THEN
        RETURN private.search_dictionary_alphabetical_group_v1(
            p_user_id, p_public_catalog, p_query, p_language_code, p_dictionary_ids, p_limit, p_cursor
        );
    END IF;

    RETURN private.search_dictionary_group_v1(
        p_user_id, p_public_catalog, p_query, p_language_code, p_dictionary_ids, v_group, p_limit, p_cursor
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.search_dictionary_headwords_group_v1(uuid, boolean, text, text, uuid[], int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.search_dictionary_body_group_v1(uuid, boolean, text, text, uuid[], text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.search_dictionary_group_keyset_v1(uuid, boolean, text, text, uuid[], text, int, text) FROM PUBLIC, anon, authenticated;
