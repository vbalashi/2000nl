-- Make the Alphabetical group a nearest browse window around the query's
-- insertion point instead of only returning following rows. Keep meaning-level
-- rows because 2000NL intentionally projects some Van Dale articles as
-- separate learner cards when they contain separate meanings.

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
    v_query text;
    v_query_unaccent text;
    v_language_code text := NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_dictionary_ids uuid[] := COALESCE(p_dictionary_ids, ARRAY[]::uuid[]);
    v_limit int := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 100);
    v_before_limit int := GREATEST(LEAST(COALESCE(p_limit, 6), 100) / 2, 0);
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
    before_rows AS (
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
                s.normalized_headword_unaccent,
                s.normalized_headword,
                ed.slug AS dictionary_slug,
                ed.name AS dictionary_name,
                ed.kind AS dictionary_kind
            FROM dictionary_search_documents s
            JOIN eligible_dictionaries ed ON ed.id = s.dictionary_id
            WHERE v_cursor = '{}'::jsonb
              AND (v_language_code IS NULL OR s.language_code = v_language_code)
              AND (
                  s.normalized_headword_unaccent,
                  s.normalized_headword,
                  s.dictionary_id,
                  s.meaning_id,
                  s.entry_id
              ) < (
                  v_query_unaccent,
                  v_query,
                  '00000000-0000-0000-0000-000000000000'::uuid,
                  -1,
                  '00000000-0000-0000-0000-000000000000'::uuid
              )
            ORDER BY
                s.normalized_headword_unaccent DESC,
                s.normalized_headword DESC,
                s.dictionary_id DESC,
                s.meaning_id DESC,
                s.entry_id DESC
            LIMIT v_before_limit
        ) previous_page
    ),
    after_rows AS (
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
    centered_rows AS (
        SELECT * FROM before_rows
        UNION ALL
        SELECT * FROM after_rows
    ),
    ordered_rows AS (
        SELECT *
        FROM centered_rows
        ORDER BY
            normalized_headword_unaccent,
            normalized_headword,
            dictionary_id,
            meaning_id,
            entry_id
    ),
    visible_page AS (
        SELECT *, row_number() OVER () AS rn FROM ordered_rows
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

REVOKE EXECUTE ON FUNCTION private.search_dictionary_alphabetical_group_v1(uuid, boolean, text, text, uuid[], int, text) FROM PUBLIC, anon, authenticated;
