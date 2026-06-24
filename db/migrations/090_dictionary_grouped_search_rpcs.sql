-- Van Dale-style grouped dictionary discovery search.
--
-- This is intentionally separate from clicked-word lookup. Lookup resolves
-- cards from strict lexical evidence; these functions return grouped search
-- previews and group pages over the extracted search tables.

CREATE OR REPLACE FUNCTION private.encode_dictionary_search_cursor_v1(p_cursor jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT encode(convert_to(COALESCE(p_cursor, '{}'::jsonb)::text, 'UTF8'), 'base64');
$$;

CREATE OR REPLACE FUNCTION private.decode_dictionary_search_cursor_v1(p_cursor text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF NULLIF(trim(COALESCE(p_cursor, '')), '') IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    RETURN convert_from(decode(p_cursor, 'base64'), 'UTF8')::jsonb;
EXCEPTION WHEN others THEN
    RETURN '{}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION private.search_dictionary_group_v1(
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
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query text;
    v_query_unaccent text;
    v_like_query text;
    v_ts_query tsquery;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_group text := COALESCE(NULLIF(trim(p_group), ''), 'headwords');
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
            'id', v_group,
            'total', 0,
            'items', '[]'::jsonb,
            'page', jsonb_build_object('limit', v_limit, 'nextCursor', NULL, 'hasMore', false)
        );
    END IF;

    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent := normalize_dictionary_search_text_unaccent(v_raw_query);
    v_like_query := '%' || v_query_unaccent || '%';
    v_ts_query := plainto_tsquery('simple', v_query_unaccent);

    IF v_group = 'headwords' THEN
        WITH eligible_dictionaries AS MATERIALIZED (
            SELECT d.id, d.slug, d.name, d.kind, d.visibility, d.owner_user_id
            FROM dictionaries d
            WHERE CASE
                WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
                ELSE p_user_id IS NOT NULL AND can_access_dictionary(p_user_id, d.id, 'read')
            END
        ),
        candidates AS MATERIALIZED (
            SELECT
                d.entry_id,
                d.dictionary_id,
                d.language_code,
                d.headword,
                d.meaning_id,
                d.part_of_speech,
                d.summary_definition,
                ed.slug AS dictionary_slug,
                ed.name AS dictionary_name,
                ed.kind AS dictionary_kind,
                'exact'::text AS relation,
                d.headword AS matched_text,
                'dictionary_search_documents.headword'::text AS source_path,
                CASE
                    WHEN d.headword = v_raw_query THEN 0
                    WHEN d.normalized_headword = v_query THEN 1
                    ELSE 2
                END AS rank
            FROM dictionary_search_documents d
            JOIN eligible_dictionaries ed ON ed.id = d.dictionary_id
            WHERE (v_language_code IS NULL OR d.language_code = v_language_code)
              AND (array_length(v_dictionary_ids, 1) IS NULL OR d.dictionary_id = ANY(v_dictionary_ids))
              AND (
                  d.normalized_headword = v_query
                  OR d.normalized_headword_unaccent = v_query_unaccent
              )

            UNION ALL

            SELECT
                d.entry_id,
                d.dictionary_id,
                d.language_code,
                d.headword,
                d.meaning_id,
                d.part_of_speech,
                d.summary_definition,
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
            JOIN dictionary_search_documents d ON d.entry_id = f.entry_id
            JOIN eligible_dictionaries ed ON ed.id = d.dictionary_id
            WHERE f.field_group = 'form'
              AND (v_language_code IS NULL OR d.language_code = v_language_code)
              AND (array_length(v_dictionary_ids, 1) IS NULL OR d.dictionary_id = ANY(v_dictionary_ids))
              AND (
                  f.normalized_text = v_query
                  OR f.normalized_text_unaccent = v_query_unaccent
              )
        ),
        deduped AS MATERIALIZED (
            SELECT DISTINCT ON (entry_id)
                *,
                lower(headword) AS headword_sort
            FROM candidates
            ORDER BY entry_id, rank, lower(headword), meaning_id
        ),
        counted AS (
            SELECT COUNT(*)::int AS total FROM deduped
        ),
        page_rows AS (
            SELECT *
            FROM deduped
            WHERE (v_cursor = '{}'::jsonb)
               OR (rank, headword_sort, meaning_id, entry_id) >
                  (
                    COALESCE((v_cursor->>'rank')::int, -1),
                    COALESCE(v_cursor->>'headwordSort', ''),
                    COALESCE((v_cursor->>'meaningId')::int, -1),
                    COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
                  )
            ORDER BY rank, headword_sort, meaning_id, entry_id
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
                    'group', v_group,
                    'rank', rank,
                    'headwordSort', headword_sort,
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

    ELSIF v_group IN ('examples', 'definitions') THEN
        WITH eligible_dictionaries AS MATERIALIZED (
            SELECT d.id, d.slug, d.name, d.kind, d.visibility, d.owner_user_id
            FROM dictionaries d
            WHERE CASE
                WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
                ELSE p_user_id IS NOT NULL AND can_access_dictionary(p_user_id, d.id, 'read')
            END
        ),
        matches AS MATERIALIZED (
            SELECT
                d.entry_id,
                d.dictionary_id,
                d.language_code,
                d.headword,
                d.meaning_id,
                d.part_of_speech,
                d.summary_definition,
                ed.slug AS dictionary_slug,
                ed.name AS dictionary_name,
                ed.kind AS dictionary_kind,
                f.field_group,
                f.field_kind,
                f.display_text,
                f.source_path,
                f.ordinal,
                lower(d.headword) AS headword_sort,
                CASE WHEN f.field_tsv @@ v_ts_query THEN 0 ELSE 1 END AS rank
            FROM dictionary_search_fields f
            JOIN dictionary_search_documents d ON d.entry_id = f.entry_id
            JOIN eligible_dictionaries ed ON ed.id = d.dictionary_id
            WHERE (v_language_code IS NULL OR d.language_code = v_language_code)
              AND (array_length(v_dictionary_ids, 1) IS NULL OR d.dictionary_id = ANY(v_dictionary_ids))
              AND (
                  CASE
                      WHEN v_group = 'examples' THEN f.field_group IN ('example', 'idiom')
                      ELSE f.field_group IN ('definition', 'context', 'note')
                  END
              )
              AND (
                  f.field_tsv @@ v_ts_query
                  OR f.normalized_text_unaccent LIKE v_like_query
              )
        ),
        counted AS (
            SELECT COUNT(*)::int AS total FROM matches
        ),
        page_rows AS (
            SELECT *
            FROM matches
            WHERE (v_cursor = '{}'::jsonb)
               OR (rank, headword_sort, meaning_id, entry_id, source_path) >
                  (
                    COALESCE((v_cursor->>'rank')::int, -1),
                    COALESCE(v_cursor->>'headwordSort', ''),
                    COALESCE((v_cursor->>'meaningId')::int, -1),
                    COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
                    COALESCE(v_cursor->>'sourcePath', '')
                  )
            ORDER BY rank, headword_sort, meaning_id, entry_id, source_path
            LIMIT v_limit + 1
        ),
        visible_page AS (
            SELECT *, row_number() OVER () AS rn FROM page_rows
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
                    'headwordSort', headword_sort,
                    'meaningId', meaning_id,
                    'entryId', entry_id,
                    'sourcePath', source_path
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

    ELSIF v_group = 'alphabetical' THEN
        WITH eligible_dictionaries AS MATERIALIZED (
            SELECT d.id, d.slug, d.name, d.kind, d.visibility, d.owner_user_id
            FROM dictionaries d
            WHERE CASE
                WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
                ELSE p_user_id IS NOT NULL AND can_access_dictionary(p_user_id, d.id, 'read')
            END
        ),
        docs AS MATERIALIZED (
            SELECT
                d.entry_id,
                d.dictionary_id,
                d.language_code,
                d.headword,
                d.meaning_id,
                d.part_of_speech,
                d.summary_definition,
                d.normalized_headword_unaccent,
                ed.slug AS dictionary_slug,
                ed.name AS dictionary_name,
                ed.kind AS dictionary_kind
            FROM dictionary_search_documents d
            JOIN eligible_dictionaries ed ON ed.id = d.dictionary_id
            WHERE (v_language_code IS NULL OR d.language_code = v_language_code)
              AND (array_length(v_dictionary_ids, 1) IS NULL OR d.dictionary_id = ANY(v_dictionary_ids))
        ),
        counted AS (
            SELECT COUNT(*)::int AS total FROM docs
        ),
        page_rows AS (
            SELECT *
            FROM docs
            WHERE (
                    v_cursor <> '{}'::jsonb
                    AND (normalized_headword_unaccent, meaning_id, entry_id) >
                        (
                            COALESCE(v_cursor->>'headwordSort', ''),
                            COALESCE((v_cursor->>'meaningId')::int, -1),
                            COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
                        )
                  )
               OR (
                    v_cursor = '{}'::jsonb
                    AND normalized_headword_unaccent >= v_query_unaccent
                  )
            ORDER BY normalized_headword_unaccent, meaning_id, entry_id
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
                    'match', jsonb_build_object(
                        'relation', 'alphabetical',
                        'matchedText', headword,
                        'sourcePath', 'dictionary_search_documents.normalized_headword_unaccent'
                    )
                ) AS payload,
                jsonb_build_object(
                    'group', v_group,
                    'headwordSort', normalized_headword_unaccent,
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

    ELSE
        RETURN jsonb_build_object(
            'id', v_group,
            'total', 0,
            'items', '[]'::jsonb,
            'page', jsonb_build_object('limit', v_limit, 'nextCursor', NULL, 'hasMore', false)
        );
    END IF;

    IF v_has_more AND v_last IS NOT NULL THEN
        v_next_cursor := private.encode_dictionary_search_cursor_v1(v_last);
    END IF;

    RETURN jsonb_build_object(
        'id', v_group,
        'total', COALESCE(v_total, 0),
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'limit', v_limit,
            'nextCursor', v_next_cursor,
            'hasMore', COALESCE(v_has_more, false)
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION search_dictionary_groups_v1(
    p_query text,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL,
    p_group text DEFAULT NULL,
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
    v_user_id uuid := (select auth.uid());
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group text := NULLIF(trim(COALESCE(p_group, '')), '');
    v_docs int;
    v_fields int;
    v_groups jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'unauthenticated');
    END IF;

    SELECT
        (SELECT COUNT(*)::int FROM dictionary_search_documents),
        (SELECT COUNT(*)::int FROM dictionary_search_fields)
    INTO v_docs, v_fields;

    IF COALESCE(v_docs, 0) = 0 OR COALESCE(v_fields, 0) = 0 THEN
        RETURN jsonb_build_object(
            'error', 'search_index_not_ready',
            'detail', 'Grouped dictionary search index is not ready.'
        );
    END IF;

    IF v_group IS NOT NULL THEN
        v_groups := jsonb_build_array(
            private.search_dictionary_group_v1(
                v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, v_group, p_limit, p_cursor
            )
        );
    ELSE
        SELECT jsonb_agg(group_payload ORDER BY group_rank)
        INTO v_groups
        FROM (
            VALUES
                (1, private.search_dictionary_group_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'headwords', p_limit, NULL)),
                (2, private.search_dictionary_group_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'examples', p_limit, NULL)),
                (3, private.search_dictionary_group_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'definitions', p_limit, NULL)),
                (4, private.search_dictionary_group_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'alphabetical', p_limit, NULL))
        ) AS groups(group_rank, group_payload);
    END IF;

    RETURN jsonb_build_object(
        'contractVersion', 'dictionary-search-v1',
        'query', v_raw_query,
        'request', jsonb_strip_nulls(jsonb_build_object(
            'languageCode', v_language_code,
            'scope', 'authenticated',
            'group', v_group
        )),
        'groups', COALESCE(v_groups, '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION search_public_dictionary_groups_v1(
    p_query text,
    p_language_code text DEFAULT NULL,
    p_group text DEFAULT NULL,
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
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group text := NULLIF(trim(COALESCE(p_group, '')), '');
    v_docs int;
    v_fields int;
    v_groups jsonb;
BEGIN
    SELECT
        (SELECT COUNT(*)::int FROM dictionary_search_documents),
        (SELECT COUNT(*)::int FROM dictionary_search_fields)
    INTO v_docs, v_fields;

    IF COALESCE(v_docs, 0) = 0 OR COALESCE(v_fields, 0) = 0 THEN
        RETURN jsonb_build_object(
            'error', 'search_index_not_ready',
            'detail', 'Grouped dictionary search index is not ready.'
        );
    END IF;

    IF v_group IS NOT NULL THEN
        v_groups := jsonb_build_array(
            private.search_dictionary_group_v1(
                NULL, true, v_raw_query, v_language_code, NULL, v_group, p_limit, p_cursor
            )
        );
    ELSE
        SELECT jsonb_agg(group_payload ORDER BY group_rank)
        INTO v_groups
        FROM (
            VALUES
                (1, private.search_dictionary_group_v1(NULL, true, v_raw_query, v_language_code, NULL, 'headwords', p_limit, NULL)),
                (2, private.search_dictionary_group_v1(NULL, true, v_raw_query, v_language_code, NULL, 'examples', p_limit, NULL)),
                (3, private.search_dictionary_group_v1(NULL, true, v_raw_query, v_language_code, NULL, 'definitions', p_limit, NULL)),
                (4, private.search_dictionary_group_v1(NULL, true, v_raw_query, v_language_code, NULL, 'alphabetical', p_limit, NULL))
        ) AS groups(group_rank, group_payload);
    END IF;

    RETURN jsonb_build_object(
        'contractVersion', 'dictionary-search-v1',
        'query', v_raw_query,
        'request', jsonb_strip_nulls(jsonb_build_object(
            'languageCode', v_language_code,
            'scope', 'public-catalog',
            'group', v_group
        )),
        'groups', COALESCE(v_groups, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION private.encode_dictionary_search_cursor_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.decode_dictionary_search_cursor_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.search_dictionary_group_v1(uuid, boolean, text, text, uuid[], text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION search_dictionary_groups_v1(text, text, uuid[], text, int, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION search_public_dictionary_groups_v1(text, text, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_dictionary_groups_v1(text, text, uuid[], text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_public_dictionary_groups_v1(text, text, text, int, text) TO service_role;
