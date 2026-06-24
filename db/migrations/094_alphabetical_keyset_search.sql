-- Make the Alphabetical grouped-search page keyset-first. This avoids
-- materializing and counting all visible dictionary_search_documents before
-- returning the first page.

CREATE INDEX IF NOT EXISTS dictionary_search_documents_browse_v2_idx
    ON dictionary_search_documents(
        language_code,
        normalized_headword_unaccent,
        normalized_headword,
        dictionary_id,
        meaning_id,
        entry_id
    );

CREATE OR REPLACE FUNCTION private.search_dictionary_alphabetical_group_v1(
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
    v_query_unaccent text;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_limit int := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 100);
    v_cursor jsonb := private.decode_dictionary_search_cursor_v1(p_cursor);
    v_items jsonb := '[]'::jsonb;
    v_has_more boolean := false;
    v_next_cursor text := NULL;
    v_last jsonb;
BEGIN
    IF v_raw_query IS NULL THEN
        RETURN jsonb_build_object(
            'id', 'alphabetical',
            'total', NULL,
            'count', jsonb_build_object('value', NULL, 'relation', 'unknown'),
            'items', '[]'::jsonb,
            'page', jsonb_build_object('limit', v_limit, 'nextCursor', NULL, 'hasMore', false)
        );
    END IF;

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
    page_rows AS (
        SELECT
            s.entry_id,
            s.dictionary_id,
            s.language_code,
            s.headword,
            s.meaning_id,
            s.part_of_speech,
            s.summary_definition,
            s.normalized_headword_unaccent,
            s.normalized_headword,
            ed.slug AS dictionary_slug,
            ed.name AS dictionary_name,
            ed.kind AS dictionary_kind
        FROM dictionary_search_documents s
        JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
        WHERE (v_language_code IS NULL OR s.language_code = v_language_code)
          AND (
              (
                  v_cursor <> '{}'::jsonb
                  AND (
                      s.normalized_headword_unaccent,
                      s.normalized_headword,
                      s.dictionary_id,
                      s.meaning_id,
                      s.entry_id
                  ) > (
                      COALESCE(v_cursor->>'headwordSort', ''),
                      COALESCE(v_cursor->>'normalizedHeadword', ''),
                      COALESCE((v_cursor->>'dictionaryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
                      COALESCE((v_cursor->>'meaningId')::int, -1),
                      COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
                  )
              )
              OR (
                  v_cursor = '{}'::jsonb
                  AND s.normalized_headword_unaccent >= v_query_unaccent
              )
          )
        ORDER BY
            s.normalized_headword_unaccent,
            s.normalized_headword,
            s.dictionary_id,
            s.meaning_id,
            s.entry_id
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
                'group', 'alphabetical',
                'headwordSort', normalized_headword_unaccent,
                'normalizedHeadword', normalized_headword,
                'dictionaryId', dictionary_id,
                'meaningId', meaning_id,
                'entryId', entry_id
            ) AS cursor_payload,
            rn
        FROM visible_page
        WHERE rn <= v_limit
    )
    SELECT
        COALESCE(jsonb_agg(payload ORDER BY rn), '[]'::jsonb),
        EXISTS(SELECT 1 FROM visible_page WHERE rn > v_limit),
        (array_agg(cursor_payload ORDER BY rn DESC))[1]
    INTO v_items, v_has_more, v_last
    FROM payloads;

    IF v_has_more AND v_last IS NOT NULL THEN
        v_next_cursor := private.encode_dictionary_search_cursor_v1(v_last);
    END IF;

    RETURN jsonb_build_object(
        'id', 'alphabetical',
        'total', NULL,
        'count', jsonb_build_object('value', NULL, 'relation', 'unknown'),
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'limit', v_limit,
            'nextCursor', v_next_cursor,
            'hasMore', COALESCE(v_has_more, false)
        )
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
    IF v_group = 'alphabetical' THEN
        RETURN private.search_dictionary_alphabetical_group_v1(
            p_user_id,
            p_public_catalog,
            p_query,
            p_language_code,
            p_dictionary_ids,
            p_limit,
            p_cursor
        );
    END IF;

    RETURN private.search_dictionary_group_v1(
        p_user_id,
        p_public_catalog,
        p_query,
        p_language_code,
        p_dictionary_ids,
        v_group,
        p_limit,
        p_cursor
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
            private.search_dictionary_group_keyset_v1(
                v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, v_group, p_limit, p_cursor
            )
        );
    ELSE
        SELECT jsonb_agg(group_payload ORDER BY group_rank)
        INTO v_groups
        FROM (
            VALUES
                (1, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'headwords', p_limit, NULL)),
                (2, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'examples', p_limit, NULL)),
                (3, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'definitions', p_limit, NULL)),
                (4, private.search_dictionary_group_keyset_v1(v_user_id, false, v_raw_query, v_language_code, p_dictionary_ids, 'alphabetical', p_limit, NULL))
        ) AS groups(group_rank, group_payload);
    END IF;

    v_groups := private.clean_dictionary_search_groups_v1(v_groups);

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
            private.search_dictionary_group_keyset_v1(
                NULL, true, v_raw_query, v_language_code, NULL, v_group, p_limit, p_cursor
            )
        );
    ELSE
        SELECT jsonb_agg(group_payload ORDER BY group_rank)
        INTO v_groups
        FROM (
            VALUES
                (1, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'headwords', p_limit, NULL)),
                (2, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'examples', p_limit, NULL)),
                (3, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'definitions', p_limit, NULL)),
                (4, private.search_dictionary_group_keyset_v1(NULL, true, v_raw_query, v_language_code, NULL, 'alphabetical', p_limit, NULL))
        ) AS groups(group_rank, group_payload);
    END IF;

    v_groups := private.clean_dictionary_search_groups_v1(v_groups);

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

REVOKE EXECUTE ON FUNCTION private.search_dictionary_alphabetical_group_v1(uuid, boolean, text, text, uuid[], int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.search_dictionary_group_keyset_v1(uuid, boolean, text, text, uuid[], text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION search_dictionary_groups_v1(text, text, uuid[], text, int, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION search_public_dictionary_groups_v1(text, text, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_dictionary_groups_v1(text, text, uuid[], text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION search_public_dictionary_groups_v1(text, text, text, int, text) TO service_role;
