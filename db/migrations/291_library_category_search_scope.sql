BEGIN;
-- First-party Library category search. Scope is applied before ranking/paging.
-- Managed forward migrations and deployment remain separately owned.

CREATE OR REPLACE FUNCTION private.library_category_entry_ids_v1(p_user uuid,p_selection jsonb)
RETURNS TABLE(entry_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','pg_temp' AS $$
  WITH dictionaries AS MATERIALIZED (
    SELECT d.id,d.kind,d.owner_user_id,
      CASE WHEN d.kind<>'user' THEN public.can_browse_dictionary(p_user,d.id) ELSE false END readable
    FROM public.dictionaries d
    WHERE private.training_material_entry_selected_v1(d.language_code,CASE WHEN d.kind='user' THEN NULL ELSE d.id END,p_selection)
      AND (p_selection->'dictionaryIds'='null'::jsonb OR (p_selection->'dictionaryIds') ? d.id::text)
  ), shared AS MATERIALIZED (
    SELECT DISTINCT entry_id FROM private.shared_author_entry_memberships_v1 WHERE user_id=p_user
  ), material AS MATERIALIZED (
    SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user,p_selection->'material')
    WHERE p_selection ? 'material'
  )
  SELECT e.id FROM private.active_word_entries e JOIN dictionaries d ON d.id=e.dictionary_id
  WHERE (d.readable OR (d.kind='user' AND (d.owner_user_id=p_user OR e.id IN (SELECT entry_id FROM shared))))
    AND private.library_entry_matches_filters_v1(e.part_of_speech,e.gender,p_selection)
    AND (NOT (p_selection ? 'material') OR e.id IN (SELECT entry_id FROM material));
$$;
REVOKE ALL ON FUNCTION private.library_category_entry_ids_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

SELECT public.similarity('','');

CREATE OR REPLACE FUNCTION private.search_library_headwords_v1(p_user_id uuid, p_public_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 6, p_cursor text DEFAULT NULL::text, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    SET pg_trgm.similarity_threshold TO '0.3'
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

    WITH selected_entries AS MATERIALIZED (
        SELECT entry_id FROM private.library_category_entry_ids_v1(p_user_id,p_library_selection)
    ), eligible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.slug, d.name, d.kind
        FROM dictionaries d
        WHERE CASE
            WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
            ELSE p_user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM dictionary_search_documents document
                JOIN selected_entries chosen ON chosen.entry_id=document.entry_id
                WHERE document.dictionary_id=d.id
            )
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
            JOIN selected_entries chosen ON chosen.entry_id=s.entry_id
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
            JOIN selected_entries chosen ON chosen.entry_id=s.entry_id
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
            JOIN selected_entries chosen ON chosen.entry_id=s.entry_id
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
            JOIN selected_entries chosen ON chosen.entry_id=s.entry_id
            WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
              AND f.field_group = 'form'
              AND (v_language_code IS NULL OR f.language_code = v_language_code)
              AND f.normalized_text_unaccent = v_query_unaccent
              AND f.normalized_text <> v_query
        ) matches
        ORDER BY entry_id, rank, normalized_headword, meaning_id
    ),
    fuzzy_candidates AS MATERIALIZED (
        SELECT s.entry_id, s.dictionary_id, s.language_code, s.headword,
            s.meaning_id, s.part_of_speech, s.summary_definition,
            s.normalized_headword, ed.slug AS dictionary_slug,
            ed.name AS dictionary_name, ed.kind AS dictionary_kind,
            'fuzzy'::text AS relation, s.headword AS matched_text,
            'dictionary_search_documents.headword'::text AS source_path,
            -- Keep the existing integer cursor ordering; every fuzzy rank is
            -- after exact (0-2) and form (3-5) matches, then similarity desc.
            (1000000 + round((1 - similarity(s.normalized_headword_unaccent,
                v_query_unaccent)) * 1000000))::integer AS rank
        FROM dictionary_search_documents s
        JOIN eligible_dictionaries ed ON ed.id=s.dictionary_id
        JOIN selected_entries chosen ON chosen.entry_id=s.entry_id
        WHERE char_length(v_query_unaccent) BETWEEN 4 AND 64
          AND (v_language_code IS NULL OR s.language_code=v_language_code)
          AND s.normalized_headword_unaccent % v_query_unaccent
          AND s.normalized_headword_unaccent <> v_query_unaccent
    ),
    deduped AS MATERIALIZED (
        SELECT DISTINCT ON (entry_id) *
        FROM (
            SELECT * FROM headword_candidates
            UNION ALL
            SELECT * FROM form_candidates
            UNION ALL
            SELECT * FROM fuzzy_candidates
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

CREATE OR REPLACE FUNCTION private.search_library_body_v1(p_user_id uuid, p_public_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_group text DEFAULT 'examples'::text, p_limit integer DEFAULT 6, p_cursor text DEFAULT NULL::text, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $_$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query_unaccent text;
    v_match_terms text[] := ARRAY[]::text[];
    v_term_query text;
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
    v_ts_query := plainto_tsquery('simple', v_query_unaccent);

    IF length(v_query_unaccent) >= 3 THEN
        WITH matching_entries AS MATERIALIZED (
            SELECT DISTINCT f.entry_id
            FROM dictionary_search_fields f
            JOIN dictionaries d ON d.id = f.dictionary_id
            WHERE f.entry_id IN (SELECT entry_id FROM private.library_category_entry_ids_v1(p_user_id,p_library_selection))
              AND f.field_group = 'form'
              AND f.extraction_version >= 2
              AND f.normalized_text_unaccent = v_query_unaccent
              AND (v_language_code IS NULL OR f.language_code = v_language_code)
              AND (array_length(v_dictionary_ids, 1) IS NULL OR f.dictionary_id = ANY(v_dictionary_ids))
              AND CASE
                  WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
                  ELSE p_user_id IS NOT NULL
              END
        )
        SELECT COALESCE(array_agg(term ORDER BY term), ARRAY[]::text[])
        INTO v_match_terms
        FROM (
            SELECT DISTINCT f.normalized_text_unaccent AS term
            FROM dictionary_search_fields f
            JOIN matching_entries m ON m.entry_id = f.entry_id
            WHERE f.entry_id IN (SELECT entry_id FROM private.library_category_entry_ids_v1(p_user_id,p_library_selection))
              AND f.field_group = 'form'
              AND f.extraction_version >= 2
              AND f.normalized_text_unaccent ~ '^[[:alnum:]]+$'

            UNION

            SELECT v_query_unaccent AS term
            WHERE v_query_unaccent ~ '^[[:alnum:]]+$'
        ) terms;

        v_term_query := CASE
            WHEN cardinality(v_match_terms) > 0
            THEN '(^|[^[:alnum:]])(' || array_to_string(v_match_terms, '|') || ')([^[:alnum:]]|$)'
            ELSE NULL
        END;
    END IF;

    WITH selected_entries AS MATERIALIZED (
        SELECT entry_id FROM private.library_category_entry_ids_v1(p_user_id,p_library_selection)
    ), eligible_dictionaries AS MATERIALIZED (
        SELECT d.id
        FROM dictionaries d
        WHERE CASE
            WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
            ELSE p_user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM dictionary_search_documents document
                JOIN selected_entries chosen ON chosen.entry_id=document.entry_id
                WHERE document.dictionary_id=d.id
            )
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
        JOIN selected_entries chosen ON chosen.entry_id=f.entry_id
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
        JOIN selected_entries chosen ON chosen.entry_id=f.entry_id
        WHERE v_term_query IS NOT NULL
          AND length(v_query_unaccent) >= 3
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
          AND f.normalized_text_unaccent ~ v_term_query
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
$_$;

CREATE OR REPLACE FUNCTION private.search_library_alphabetical_v1(p_user_id uuid, p_public_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 6, p_cursor text DEFAULT NULL::text, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
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

    WITH selected_entries AS MATERIALIZED (
        SELECT entry_id FROM private.library_category_entry_ids_v1(p_user_id,p_library_selection)
    ), eligible_dictionaries AS MATERIALIZED (
        SELECT d.id, d.slug, d.name, d.kind
        FROM dictionaries d
        WHERE CASE
            WHEN p_public_catalog THEN d.visibility IN ('system', 'public')
            ELSE p_user_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM dictionary_search_documents document
                JOIN selected_entries chosen ON chosen.entry_id=document.entry_id
                WHERE document.dictionary_id=d.id
            )
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
            JOIN selected_entries chosen ON chosen.entry_id=s.entry_id
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
            JOIN selected_entries chosen ON chosen.entry_id=s.entry_id
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

REVOKE ALL ON FUNCTION private.search_library_headwords_v1(uuid,boolean,text,text,uuid[],integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.search_library_body_v1(uuid,boolean,text,text,uuid[],text,integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.search_library_alphabetical_v1(uuid,boolean,text,text,uuid[],integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.search_library_category_v1(
  p_user_id uuid,p_query text,p_language_code text DEFAULT NULL,p_dictionary_ids uuid[] DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,p_material jsonb DEFAULT NULL,p_group text DEFAULT 'headwords',
  p_limit integer DEFAULT 100,p_cursor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','pg_temp' AS $_$
DECLARE
  preferences jsonb; allowed_codes jsonb; selection jsonb; dictionary_ids jsonb;
  payload jsonb; parts jsonb; article text; outer_cursor jsonb; inner_cursor text;
  scope_key text; unavailable_count integer := 0;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF NULLIF(btrim(p_query),'') IS NULL OR length(p_query)>200 THEN RETURN jsonb_build_object('error','invalid_query'); END IF;
  IF p_group IS NULL OR p_group NOT IN ('headwords','examples','definitions','alphabetical') THEN RETURN jsonb_build_object('error','invalid_search_group'); END IF;
  IF NOT private.dictionary_search_index_ready_v1() THEN RETURN jsonb_build_object('error','search_index_not_ready'); END IF;
  IF p_material IS NOT NULL AND jsonb_typeof(p_material)<>'object' THEN
    RETURN jsonb_build_object('error','invalid_material_scope');
  END IF;
  IF p_material IS NOT NULL THEN
  IF p_material->>'kind' IS NULL OR p_material->>'kind' NOT IN ('collection','label')
    OR p_material->>'id' IS NULL OR p_material->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_material) key WHERE key NOT IN ('kind','id','collectionType'))
    OR (p_material->>'kind'='label' AND p_material ? 'collectionType')
    OR (p_material->>'kind'='collection' AND (p_material->>'collectionType' IS NULL OR p_material->>'collectionType' NOT IN ('user','curated')))
    OR p_dictionary_ids IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_material_scope');
  END IF;
  IF NOT (
    (p_material->>'kind'='label' AND EXISTS(SELECT 1 FROM private.collection_labels WHERE user_id=p_user_id AND id=(p_material->>'id')::uuid))
    OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='user' AND (EXISTS(SELECT 1 FROM public.user_word_lists WHERE user_id=p_user_id AND id=(p_material->>'id')::uuid)
    OR EXISTS(SELECT 1 FROM private.shared_collection_ids_v1(p_user_id) shared WHERE shared.collection_id=(p_material->>'id')::uuid)))
    OR (p_material->>'kind'='collection' AND p_material->>'collectionType'='curated' AND EXISTS(SELECT 1 FROM public.word_lists WHERE id=(p_material->>'id')::uuid))
  ) THEN RETURN jsonb_build_object('error','material_not_accessible'); END IF;
  END IF;
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF cardinality(p_dictionary_ids)>100 OR array_position(p_dictionary_ids,NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_dictionary_scope');
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) key WHERE key NOT IN ('parts','article')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts)<>'array' THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  IF jsonb_array_length(parts)>10 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  IF p_filters ? 'article' AND p_filters->'article'<>'null'::jsonb AND
    (jsonb_typeof(p_filters->'article')<>'string' OR p_filters->>'article' NOT IN ('de','het')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  article := p_filters->>'article';
  IF article IS NOT NULL AND NOT (parts ? 'noun') THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  SELECT COALESCE(jsonb_agg(part ORDER BY part),'[]'::jsonb) INTO parts
    FROM (SELECT DISTINCT value AS part FROM jsonb_array_elements_text(parts)) canonical;
  SELECT material_preferences INTO preferences FROM public.user_settings WHERE user_id=p_user_id;
  preferences := COALESCE(preferences,'{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb);
  IF jsonb_array_length(preferences->'learningLanguages')=0 THEN
    allowed_codes := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(item->>'code' ORDER BY item->>'code'),'[]'::jsonb)
      INTO allowed_codes FROM jsonb_array_elements(preferences->'learningLanguages') item
      WHERE item->'paused'='false'::jsonb;
  END IF;
  IF p_dictionary_ids IS NULL THEN dictionary_ids := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO dictionary_ids
      FROM (SELECT DISTINCT unnest(p_dictionary_ids) id) canonical;
  END IF;
  selection := jsonb_build_object('materialSelection',jsonb_build_object(
    'schemaVersion',1,'allowedLanguageCodes',allowed_codes,
    'disabledDictionaryIds',COALESCE(preferences->'disabledDictionaryIds','[]'::jsonb)),
    'dictionaryIds',dictionary_ids,'parts',parts,'article',article) || CASE WHEN p_material IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('material',p_material) END;
  
  -- Bind cursors to the exact live membership set; additions/removals cannot silently skip pages.
  IF p_material IS NOT NULL THEN
  selection := selection || jsonb_build_object('materialRevision', (
    SELECT md5(COALESCE(string_agg(entry_id::text,',' ORDER BY entry_id),''))
    FROM private.library_material_entry_ids_v1(p_user_id,p_material)
  ));
  END IF;

  scope_key := md5(jsonb_build_array('library-category-v1',p_user_id,btrim(p_query),p_language_code,p_group,selection)::text);
  IF p_cursor IS NOT NULL THEN
    outer_cursor := private.decode_dictionary_search_cursor_v1(p_cursor);
    IF outer_cursor->>'scopeKey' IS DISTINCT FROM scope_key OR outer_cursor->>'inner' IS NULL THEN
      RETURN jsonb_build_object('error','invalid_cursor');
    END IF;
    inner_cursor := outer_cursor->>'inner';
  END IF;
  IF p_group='headwords' THEN
    payload := private.search_library_headwords_v1(p_user_id,false,p_query,p_language_code,p_dictionary_ids,p_limit,inner_cursor,selection);
  ELSIF p_group='alphabetical' THEN
    payload := private.search_library_alphabetical_v1(p_user_id,false,p_query,p_language_code,p_dictionary_ids,p_limit,inner_cursor,selection);
  ELSE
    payload := private.search_library_body_v1(p_user_id,false,p_query,p_language_code,p_dictionary_ids,p_group,p_limit,inner_cursor,selection);
  END IF;
  IF payload#>>'{page,nextCursor}' IS NOT NULL THEN
    payload := jsonb_set(payload,'{page,nextCursor}',to_jsonb(private.encode_dictionary_search_cursor_v1(
      jsonb_build_object('scopeKey',scope_key,'inner',payload#>>'{page,nextCursor}'))));
  END IF;
  IF p_material IS NOT NULL THEN
    SELECT count(*)::integer INTO unavailable_count
    FROM private.library_material_entry_ids_v1(p_user_id,p_material) member
    JOIN public.word_entries entry ON entry.id=member.entry_id
    WHERE (p_language_code IS NULL OR entry.language_code=p_language_code)
      AND entry.id NOT IN (SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user_id,p_material));
  END IF;
  RETURN jsonb_build_object('groups',private.clean_dictionary_search_groups_v1(jsonb_build_array(payload)),'unavailableEntryCount',unavailable_count);
END;
$_$;
REVOKE ALL ON FUNCTION public.search_library_category_v1(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text) FROM PUBLIC,anon,authenticated,authenticator;
GRANT EXECUTE ON FUNCTION public.search_library_category_v1(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
