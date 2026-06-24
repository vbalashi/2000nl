-- Bound grouped body search inside each match branch before hydration.
-- This keeps Examples/Definitions fast for common terms by avoiding full
-- materialization of every FTS/substring hit before LIMIT + 1 is applied.

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
    fts_page AS MATERIALIZED (
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
          AND (
              v_cursor = '{}'::jsonb
              OR (0, f.meaning_ordinal, f.item_ordinal, f.entry_id, f.source_path) >
                 (
                    COALESCE((v_cursor->>'rank')::int, -1),
                    COALESCE((v_cursor->>'meaningOrdinal')::int, -1),
                    COALESCE((v_cursor->>'itemOrdinal')::int, -1),
                    COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
                    COALESCE(v_cursor->>'sourcePath', '')
                 )
          )
        ORDER BY f.meaning_ordinal, f.item_ordinal, f.entry_id, f.source_path
        LIMIT v_limit + 1
    ),
    substring_page AS MATERIALIZED (
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
          AND (
              COALESCE((v_cursor->>'rank')::int, 0) >= 1
              OR (SELECT count(*) FROM fts_page) <= v_limit
          )
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
          AND (
              v_cursor = '{}'::jsonb
              OR (1, f.meaning_ordinal, f.item_ordinal, f.entry_id, f.source_path) >
                 (
                    COALESCE((v_cursor->>'rank')::int, -1),
                    COALESCE((v_cursor->>'meaningOrdinal')::int, -1),
                    COALESCE((v_cursor->>'itemOrdinal')::int, -1),
                    COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
                    COALESCE(v_cursor->>'sourcePath', '')
                 )
          )
        ORDER BY f.meaning_ordinal, f.item_ordinal, f.entry_id, f.source_path
        LIMIT v_limit + 1
    ),
    page_fields AS MATERIALIZED (
        SELECT *
        FROM (
            SELECT * FROM fts_page
            UNION ALL
            SELECT * FROM substring_page
        ) matches
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

REVOKE EXECUTE ON FUNCTION private.search_dictionary_body_group_v1(uuid, boolean, text, text, uuid[], text, int, text) FROM PUBLIC, anon, authenticated;
