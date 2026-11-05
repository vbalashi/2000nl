BEGIN;
-- Batch Library membership and sort ranks before grouping; reuse the body-search scope.
-- Load pg_trgm USERSET parameters before replacing its configured headword helper.
SELECT public.similarity('', '');

CREATE FUNCTION private.library_entry_order_ranks_v1(p_entry_ids uuid[],p_sort text)
RETURNS TABLE(entry_id uuid,sort_rank integer) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp SET enable_nestloop=on AS $$
 WITH requested AS MATERIALIZED (SELECT DISTINCT unnest(p_entry_ids) id),
 entries AS MATERIALIZED (
  SELECT r.id,e.language_code,e.headword,COALESCE(d.kind<>'user',false) rankable
  FROM requested r LEFT JOIN private.active_word_entries e ON e.id=r.id
  LEFT JOIN public.dictionaries d ON d.id=e.dictionary_id WHERE p_sort IN ('spoken','written')
 ), spellings AS MATERIALIZED (
  SELECT DISTINCT language_code,headword FROM entries WHERE rankable
 ), ranks AS MATERIALIZED (
  SELECT s.language_code,s.headword,r.rank FROM spellings s
  LEFT JOIN private.vocabulary_frequency_ranks r ON r.language_code=s.language_code
   AND r.profile=p_sort AND r.spelling_key=private.vocabulary_spelling_key_v1(s.headword)
 )
 SELECT e.id,COALESCE(r.rank,2147483647) FROM entries e LEFT JOIN ranks r
  ON e.rankable AND r.language_code=e.language_code AND r.headword=e.headword;
$$;
REVOKE ALL ON FUNCTION private.library_entry_order_ranks_v1(uuid[],text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.library_selected_entry_ids_v1(p_selection jsonb,p_candidate_entry_ids uuid[])
RETURNS TABLE(entry_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp
SET enable_nestloop=on AS $$
 WITH flags AS MATERIALIZED (
  SELECT private.vocabulary_has_selection_v1(p_selection->'vocabulary') vocabulary_active,
   (p_selection->'vocabulary' IS NULL OR p_selection->'vocabulary'='null'::jsonb
    OR private.valid_vocabulary_selection_v1(p_selection->'vocabulary')) vocabulary_allowed,
   COALESCE((COALESCE(p_selection->'parts','[]'::jsonb)='[]'::jsonb AND p_selection->>'article' IS NULL)
    OR p_selection#>'{vocabulary,materialKinds}'='["other"]'::jsonb,false) skip_lexical
 ), candidates AS MATERIALIZED (
  SELECT e.id,e.part_of_speech,e.gender FROM private.active_word_entries e
  WHERE e.id IN (SELECT unnest(p_candidate_entry_ids))
 ), vocabulary AS MATERIALIZED (
  SELECT chosen.entry_id FROM flags f CROSS JOIN LATERAL private.vocabulary_selected_entry_ids_v1(
    p_selection->'vocabulary',ARRAY(SELECT id FROM candidates)) chosen
  WHERE f.vocabulary_active AND f.vocabulary_allowed
 ), lexical_values AS MATERIALIZED (
  SELECT DISTINCT COALESCE(c.part_of_speech,'') part_key,COALESCE(c.gender,'') gender_key
  FROM candidates c CROSS JOIN flags f WHERE NOT f.skip_lexical
 ), lexical_matches AS MATERIALIZED (
  SELECT part_key,gender_key FROM lexical_values
  WHERE private.library_entry_matches_filters_v1(part_key,gender_key,p_selection)
 )
 SELECT c.id FROM candidates c CROSS JOIN flags f
 WHERE f.vocabulary_allowed AND (NOT f.vocabulary_active OR c.id IN (SELECT entry_id FROM vocabulary))
  AND (f.skip_lexical OR EXISTS(SELECT 1 FROM lexical_matches m
    WHERE m.part_key=COALESCE(c.part_of_speech,'') AND m.gender_key=COALESCE(c.gender,'')));
$$;
REVOKE ALL ON FUNCTION private.library_selected_entry_ids_v1(jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.lookup_platform_v2_library_browse_entries_v1(p_user_id uuid, p_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query text;
    v_query_unaccent text;
    v_language_code text :=
        NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group_limit integer :=
        LEAST(GREATEST(COALESCE(p_group_limit, 10), 1), 25);
    v_group_entry_bound integer :=
        LEAST(GREATEST(COALESCE(p_group_entry_bound, 50), 1), 100);
    v_cursor jsonb :=
        private.decode_dictionary_search_cursor_v1(p_cursor);
    v_query_key text;
    v_cursor_tier_rank integer;
    v_cursor_match_rank integer;
    v_cursor_dictionary_rank integer;
    v_cursor_sort_headword text;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_total_groups integer; v_oversized_group jsonb;
    v_unfiltered boolean := p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary');
BEGIN
    IF p_catalog AND p_user_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF NOT p_catalog AND p_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF v_raw_query IS NOT NULL THEN RETURN jsonb_build_object('error','browse_query_required'); END IF;
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent :=
        normalize_dictionary_search_text_unaccent(v_raw_query);
    v_query_key := encode(
        digest(
            concat_ws(
                chr(31),
                'platform-v2-group-cursor-v1',
                COALESCE(p_user_id::text, 'catalog'),
                p_catalog::text,
                v_raw_query,
                v_query,
                v_query_unaccent,
                COALESCE(v_language_code, ''), p_library_selection::text,private.vocabulary_frequency_revision_v1()
            ),
            'sha256'
        ),
        'hex'
    );

    IF NULLIF(trim(COALESCE(p_cursor, '')), '') IS NOT NULL THEN
        IF v_cursor = '{}'::jsonb
           OR v_cursor->>'version' <> 'platform-v2-group-cursor-v1'
           OR v_cursor->>'queryKey' IS DISTINCT FROM v_query_key THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
        BEGIN
            v_cursor_tier_rank := (v_cursor->>'tierRank')::integer;
            v_cursor_match_rank := (v_cursor->>'matchRank')::integer;
            v_cursor_dictionary_rank :=
                (v_cursor->>'dictionaryRank')::integer;
            v_cursor_sort_headword := v_cursor->>'sortHeadword';
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_sort_headword IS NULL
           OR v_cursor_group_id IS NULL THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
    END IF;

    IF p_catalog
       AND EXISTS (
           SELECT 1
           FROM private.active_word_entries AS entry
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = entry.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR entry.language_code = v_language_code
             )
           LIMIT 1
       )
       AND NOT EXISTS (
           SELECT 1
           FROM public.dictionary_search_documents AS document
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = document.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR document.language_code = v_language_code
             )
           LIMIT 1
       ) THEN
        RETURN jsonb_build_object('error', 'search_index_not_ready');
    END IF;

    WITH shared_entries AS MATERIALIZED (
      SELECT shared.entry_id FROM private.shared_author_entry_ids_v1(p_user_id) shared WHERE NOT p_catalog
    ), shared_dictionaries AS MATERIALIZED (
      SELECT DISTINCT entry.dictionary_id FROM shared_entries shared
      JOIN private.active_word_entries entry ON entry.id=shared.entry_id
    ), user_context AS MATERIALIZED (
        SELECT COALESCE(
            (
                SELECT subscription_tier
                FROM public.user_settings
                WHERE user_id = p_user_id
            ),
            'free'
        ) AS subscription_tier
    ),
    eligible_dictionaries AS MATERIALIZED (
      SELECT dictionary.*, CASE WHEN dictionary.kind='user' THEN 0 WHEN dictionary.kind='curated' THEN 1 ELSE 2 END AS dictionary_rank
      FROM public.dictionaries dictionary
      WHERE private.training_material_entry_selected_v1(dictionary.language_code,
        CASE WHEN dictionary.kind='user' THEN NULL ELSE dictionary.id END,p_library_selection)
        AND (p_library_selection->'dictionaryIds'='null'::jsonb OR (p_library_selection->'dictionaryIds') ? dictionary.id::text)
        AND ((p_catalog AND dictionary.publication_state='general' AND dictionary.kind<>'user')
          OR (NOT p_catalog AND (
            (public.can_browse_dictionary(p_user_id, dictionary.id) AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id))
            OR (dictionary.kind='user' AND dictionary.id IN (SELECT dictionary_id FROM shared_dictionaries)))))
    ),
    selected_entries AS MATERIALIZED (
        SELECT chosen.entry_id FROM private.library_selected_entry_ids_v1(p_library_selection,ARRAY(
        SELECT entry.id FROM private.active_word_entries entry
        JOIN eligible_dictionaries dictionary ON dictionary.id=entry.dictionary_id
        WHERE (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries)))) chosen
    ),
    -- Empty browse has one headword tier. Do not sort/deduplicate the same
    -- primary-key document stream through the exact/form search tiers.
    candidates AS MATERIALIZED (
        -- Separate guarded branches also skip wide entry reads in a cached
        -- generic plan, where an optional LEFT JOIN would still scan its heap.
        SELECT document.entry_id, document.headword, document.meaning_id,
            document.dictionary_id, normalize_dictionary_search_text(document.headword) AS sort_headword,
            'exact-headword'::text AS resolved_by, document.headword AS matched_text,
            1 AS tier_rank, CASE WHEN document.normalized_headword=v_query THEN 1 ELSE 2 END AS match_rank
        FROM public.dictionary_search_documents document
        JOIN eligible_dictionaries dictionary ON dictionary.id=document.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR document.entry_id IN (SELECT entry_id FROM shared_entries))
        WHERE v_unfiltered
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
        UNION ALL
        SELECT document.entry_id, document.headword, document.meaning_id,
            document.dictionary_id, normalize_dictionary_search_text(document.headword) AS sort_headword,
            'exact-headword'::text AS resolved_by, document.headword AS matched_text,
            1 AS tier_rank, CASE WHEN document.normalized_headword=v_query THEN 1 ELSE 2 END AS match_rank
        FROM public.dictionary_search_documents document
        JOIN eligible_dictionaries dictionary ON dictionary.id=document.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR document.entry_id IN (SELECT entry_id FROM shared_entries))
        JOIN private.active_word_entries filter_entry ON filter_entry.id=document.entry_id
        WHERE NOT (v_unfiltered)
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
          AND filter_entry.id IN (SELECT entry_id FROM selected_entries)
        UNION ALL
        SELECT entry.id, entry.headword, entry.meaning_id, entry.dictionary_id,
            normalize_dictionary_search_text(entry.headword),
            'exact-headword'::text, entry.headword, 1, 2
        FROM private.active_word_entries entry
        JOIN eligible_dictionaries dictionary ON dictionary.id=entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        LEFT JOIN public.dictionary_search_documents document ON document.entry_id=entry.id
        WHERE NOT p_catalog AND dictionary.kind='user' AND document.entry_id IS NULL
          AND EXISTS (SELECT 1 FROM eligible_dictionaries WHERE kind='user')
          AND (v_language_code IS NULL OR entry.language_code=v_language_code)
          AND entry.id IN (SELECT entry_id FROM selected_entries)
    ),
    -- Resolve identities in one narrow pass. Candidate CTE cardinality estimates
    -- otherwise turn a catalogue browse into tens of thousands of index probes.
    source_identities AS MATERIALIZED (
        SELECT binding.word_entry_id, source_group.id
        FROM private.source_entry_bindings binding
        JOIN eligible_dictionaries dictionary ON dictionary.id=binding.dictionary_id
        JOIN private.platform_v2_headword_groups source_group
          ON source_group.management_kind='source'
         AND source_group.dictionary_id=binding.dictionary_id
         AND source_group.identity_scheme_version=binding.identity_scheme_version
         AND source_group.source_group_key=binding.source_group_key
        WHERE binding.binding_state='active'
    ),
    candidate_identity AS MATERIALIZED (
        SELECT candidate.*, 0 AS dictionary_rank,
            COALESCE(source_identity.id,user_group.id) AS headword_group_id
        FROM candidates candidate
        LEFT JOIN source_identities source_identity ON source_identity.word_entry_id=candidate.entry_id
        LEFT JOIN private.platform_v2_headword_groups user_group
          ON user_group.management_kind='user' AND user_group.singleton_entry_id=candidate.entry_id
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(sort_headword)
                AS sort_headword,
            (array_agg(
                resolved_by
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    sort_headword,
                    entry_id
            ))[1] AS resolved_by,
            (array_agg(
                matched_text
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    sort_headword,
                    entry_id
            ))[1] AS matched_text
        FROM candidate_identity
        LEFT JOIN candidate_order_ranks order_rank USING (entry_id)
        WHERE headword_group_id IS NOT NULL
        GROUP BY headword_group_id
    ),
    after_cursor AS MATERIALIZED (
        SELECT *
        FROM candidate_groups
        WHERE v_cursor_group_id IS NULL
           OR (
                tier_rank,
                match_rank,
                dictionary_rank,
                sort_headword,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit + 1
    ),
    returned_groups AS MATERIALIZED (
        SELECT *
        FROM after_cursor
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit
    ),
    group_entry_ids AS MATERIALIZED (
        SELECT
            group_page.*,
            entry.id AS entry_id,
            COALESCE(binding.sense_ordinal, entry.meaning_id)
                AS group_meaning_order
        FROM returned_groups AS group_page
        JOIN private.platform_v2_headword_groups AS headword_group
          ON headword_group.id = group_page.headword_group_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON headword_group.management_kind = 'source'
         AND binding.dictionary_id = headword_group.dictionary_id
         AND binding.identity_scheme_version =
             headword_group.identity_scheme_version
         AND binding.source_group_key = headword_group.source_group_key
         AND binding.binding_state = 'active'
        JOIN private.active_word_entries AS entry
          ON entry.id = COALESCE(
              binding.word_entry_id,
              headword_group.singleton_entry_id
          )
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE private.vocabulary_entry_selected_v1(entry.id,p_library_selection->'vocabulary')
    ),
    group_sizes AS MATERIALIZED (
        SELECT
            headword_group_id,
            count(*)::integer AS entry_count
        FROM group_entry_ids
        GROUP BY headword_group_id
    ),
    oversized_groups AS MATERIALIZED (
        SELECT jsonb_build_object(
            'headwordGroupId', size.headword_group_id,
            'entryCount', size.entry_count,
            'safetyBound', v_group_entry_bound
        ) AS error_payload
        FROM group_sizes AS size
        WHERE size.entry_count > v_group_entry_bound
        ORDER BY size.entry_count DESC, size.headword_group_id
        LIMIT 1
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            entry.*,
            dictionary.language_code AS dictionary_language_code,
            dictionary.slug AS dictionary_slug,
            dictionary.name AS dictionary_name,
            dictionary.kind AS dictionary_kind,
            dictionary.visibility AS dictionary_visibility,
            dictionary.owner_user_id AS dictionary_owner_user_id,
            dictionary.is_editable AS dictionary_is_editable,
            dictionary.schema_key AS dictionary_schema_key,
            dictionary.schema_version AS dictionary_schema_version
        FROM group_entry_ids AS member
        JOIN private.active_word_entries AS entry
          ON entry.id = member.entry_id
        JOIN public.dictionaries AS dictionary
          ON dictionary.id=entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE NOT EXISTS (SELECT 1 FROM oversized_groups)
    ),
    payloads AS (
        SELECT
            jsonb_strip_nulls(jsonb_build_object(
                'id', entry.id,
                'dictionary_id', entry.dictionary_id,
                'language_code', entry.language_code,
                'headword', entry.headword,
                'meaning_id', entry.meaning_id,
                'part_of_speech', entry.part_of_speech,
                'gender', entry.gender,
                'raw', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN private.shared_instructional_raw_v1(entry.raw) ELSE entry.raw END,
                'is_nt2_2000', entry.is_nt2_2000,
                'meanings_count', size.entry_count,
                'dictionary', jsonb_build_object(
                    'id', entry.dictionary_id,
                    'language_code', entry.dictionary_language_code,
                    'slug', entry.dictionary_slug,
                    'name', entry.dictionary_name,
                    'kind', entry.dictionary_kind,
                    'visibility', entry.dictionary_visibility,
                    'owner_user_id',
                        entry.dictionary_owner_user_id,
                    'is_editable', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN false ELSE entry.dictionary_is_editable END,
                    'schema_key', entry.dictionary_schema_key,
                    'schema_version',
                        entry.dictionary_schema_version
                ),
                'dictionary_name', entry.dictionary_name,
                'dictionary_slug', entry.dictionary_slug,
                'dictionary_kind', entry.dictionary_kind,
                'search_match_group', entry.resolved_by,
                'search_matched_text', entry.matched_text
            )) AS payload,
            entry.tier_rank,
            entry.match_rank,
            entry.dictionary_rank,
            entry.sort_headword,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.id
        FROM group_entries AS entry
        JOIN group_sizes AS size
          ON size.headword_group_id = entry.headword_group_id
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    payload
                    ORDER BY
                        tier_rank,
                        match_rank,
                        dictionary_rank,
                        sort_headword,
                        headword_group_id,
                        group_meaning_order,
                        id
                )
                FROM payloads
            ),
            '[]'::jsonb
        ),
        (SELECT count(*) > v_group_limit FROM after_cursor),
        (
            SELECT private.encode_dictionary_search_cursor_v1(
                jsonb_build_object(
                    'version', 'platform-v2-group-cursor-v1',
                    'queryKey', v_query_key,
                    'tierRank', tier_rank,
                    'matchRank', match_rank,
                    'dictionaryRank', dictionary_rank,
                    'sortHeadword', sort_headword,
                    'headwordGroupId', headword_group_id
                )
            )
            FROM returned_groups
            ORDER BY
                tier_rank DESC,
                match_rank DESC,
                dictionary_rank DESC,
                sort_headword DESC,
                headword_group_id DESC
            LIMIT 1
        ),
        (
            SELECT count(*)::integer
            FROM candidate_identity
            WHERE headword_group_id IS NULL
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups;

    IF v_missing_identity_count > 0 THEN
        RETURN jsonb_build_object(
            'error', 'presentation_identity_incomplete'
        );
    END IF;
    IF v_oversized_group IS NOT NULL THEN
        RETURN jsonb_build_object(
            'error', 'group-too-large',
            'group', v_oversized_group
        );
    END IF;

    RETURN jsonb_build_object(
        'query', v_raw_query,
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'totalGroups', v_total_groups,
            'selectedTierComplete', NOT COALESCE(v_has_more, false),
            'nextGroupCursor', CASE
                WHEN COALESCE(v_has_more, false) THEN v_next_cursor
                ELSE NULL
            END
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.lookup_platform_v2_library_filtered_entries_base_v1(p_user_id uuid, p_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query text;
    v_query_unaccent text;
    v_language_code text :=
        NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group_limit integer :=
        LEAST(GREATEST(COALESCE(p_group_limit, 10), 1), 25);
    v_group_entry_bound integer :=
        LEAST(GREATEST(COALESCE(p_group_entry_bound, 50), 1), 100);
    v_cursor jsonb :=
        private.decode_dictionary_search_cursor_v1(p_cursor);
    v_query_key text;
    v_cursor_tier_rank integer;
    v_cursor_match_rank integer;
    v_cursor_dictionary_rank integer;
    v_cursor_sort_headword text;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_total_groups integer; v_oversized_group jsonb;
    v_unfiltered boolean := p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary');
BEGIN
    IF p_catalog AND p_user_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF NOT p_catalog AND p_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF v_raw_query IS NULL THEN
        RETURN private.lookup_platform_v2_library_browse_entries_v1(
            p_user_id,p_catalog,p_query,p_language_code,p_cursor,p_group_limit,p_group_entry_bound,p_library_selection);
    END IF;
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent :=
        normalize_dictionary_search_text_unaccent(v_raw_query);
    v_query_key := encode(
        digest(
            concat_ws(
                chr(31),
                'platform-v2-group-cursor-v1',
                COALESCE(p_user_id::text, 'catalog'),
                p_catalog::text,
                v_raw_query,
                v_query,
                v_query_unaccent,
                COALESCE(v_language_code, ''), p_library_selection::text,private.vocabulary_frequency_revision_v1()
            ),
            'sha256'
        ),
        'hex'
    );

    IF NULLIF(trim(COALESCE(p_cursor, '')), '') IS NOT NULL THEN
        IF v_cursor = '{}'::jsonb
           OR v_cursor->>'version' <> 'platform-v2-group-cursor-v1'
           OR v_cursor->>'queryKey' IS DISTINCT FROM v_query_key THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
        BEGIN
            v_cursor_tier_rank := (v_cursor->>'tierRank')::integer;
            v_cursor_match_rank := (v_cursor->>'matchRank')::integer;
            v_cursor_dictionary_rank :=
                (v_cursor->>'dictionaryRank')::integer;
            v_cursor_sort_headword := v_cursor->>'sortHeadword';
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_sort_headword IS NULL
           OR v_cursor_group_id IS NULL THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
    END IF;

    IF p_catalog
       AND EXISTS (
           SELECT 1
           FROM private.active_word_entries AS entry
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = entry.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR entry.language_code = v_language_code
             )
           LIMIT 1
       )
       AND NOT EXISTS (
           SELECT 1
           FROM public.dictionary_search_documents AS document
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = document.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR document.language_code = v_language_code
             )
           LIMIT 1
       ) THEN
        RETURN jsonb_build_object('error', 'search_index_not_ready');
    END IF;

    WITH shared_entries AS MATERIALIZED (
      SELECT shared.entry_id FROM private.shared_author_entry_ids_v1(p_user_id) shared WHERE NOT p_catalog
    ), shared_dictionaries AS MATERIALIZED (
      SELECT DISTINCT entry.dictionary_id FROM shared_entries shared
      JOIN private.active_word_entries entry ON entry.id=shared.entry_id
    ), user_context AS MATERIALIZED (
        SELECT COALESCE(
            (
                SELECT subscription_tier
                FROM public.user_settings
                WHERE user_id = p_user_id
            ),
            'free'
        ) AS subscription_tier
    ),
    eligible_dictionaries AS MATERIALIZED (
      SELECT dictionary.*, CASE WHEN dictionary.kind='user' THEN 0 WHEN dictionary.kind='curated' THEN 1 ELSE 2 END AS dictionary_rank
      FROM public.dictionaries dictionary
      WHERE private.training_material_entry_selected_v1(dictionary.language_code,
        CASE WHEN dictionary.kind='user' THEN NULL ELSE dictionary.id END,p_library_selection)
        AND (p_library_selection->'dictionaryIds'='null'::jsonb OR (p_library_selection->'dictionaryIds') ? dictionary.id::text)
        AND ((p_catalog AND dictionary.publication_state='general' AND dictionary.kind<>'user')
          OR (NOT p_catalog AND (
            (public.can_browse_dictionary(p_user_id, dictionary.id) AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id))
            OR (dictionary.kind='user' AND dictionary.id IN (SELECT dictionary_id FROM shared_dictionaries)))))
    ),
    selected_entries AS MATERIALIZED (
        SELECT chosen.entry_id FROM private.library_selected_entry_ids_v1(p_library_selection,ARRAY(
        SELECT entry.id FROM private.active_word_entries entry
        JOIN eligible_dictionaries dictionary ON dictionary.id=entry.dictionary_id
        WHERE (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries)))) chosen
    ),
    indexed_headword_matches AS MATERIALIZED (
        SELECT
            document.entry_id,
            'exact-headword'::text AS resolved_by,
            document.headword AS matched_text,
            1 AS tier_rank,
            CASE
                WHEN document.headword = v_raw_query THEN 0
                WHEN document.normalized_headword = v_query THEN 1
                ELSE 2
            END AS match_rank,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_documents AS document
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=document.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR document.entry_id IN (SELECT entry_id FROM shared_entries))
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND (
            v_language_code IS NULL
            OR document.language_code = v_language_code
        )
          AND (v_raw_query IS NULL OR document.normalized_headword = v_query)

        UNION ALL

        SELECT
            document.entry_id,
            'exact-headword'::text,
            document.headword,
            1,
            CASE
                WHEN document.headword = v_raw_query THEN 0
                WHEN document.normalized_headword = v_query THEN 1
                ELSE 2
            END,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_documents AS document
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=document.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR document.entry_id IN (SELECT entry_id FROM shared_entries))
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND (
            v_language_code IS NULL
            OR document.language_code = v_language_code
        )
          AND document.normalized_headword_unaccent =
              v_query_unaccent
          AND document.normalized_headword <> v_query
    ),
    legacy_user_headword_matches AS MATERIALIZED (
        SELECT
            entry.id AS entry_id,
            'exact-headword'::text AS resolved_by,
            entry.headword AS matched_text,
            1 AS tier_rank,
            CASE
                WHEN entry.headword = v_raw_query THEN 0
                WHEN lower(entry.headword) = lower(v_raw_query) THEN 1
                ELSE 2
            END AS match_rank,
            entry.headword,
            entry.meaning_id,
            entry.dictionary_id
        FROM private.active_word_entries AS entry
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        LEFT JOIN public.dictionary_search_documents AS document
          ON document.entry_id = entry.id
        WHERE entry.id IN (SELECT entry_id FROM selected_entries) AND NOT p_catalog
          AND dictionary.kind = 'user'
          AND document.entry_id IS NULL
          AND (
              v_language_code IS NULL
              OR entry.language_code = v_language_code
          )
          AND (
              v_raw_query IS NULL OR lower(entry.headword) = lower(v_raw_query)
              OR normalize_dictionary_search_text_unaccent(
                  entry.headword
              ) = v_query_unaccent
          )
    ),
    headword_matches AS MATERIALIZED (
        SELECT * FROM indexed_headword_matches
        UNION ALL
        SELECT * FROM legacy_user_headword_matches
    ),
    headword_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (match.entry_id)
            match.*
        FROM headword_matches AS match
        ORDER BY
            match.entry_id,
            match.match_rank,
            normalize_dictionary_search_text(match.headword),
            match.meaning_id
    ),
    indexed_form_matches AS MATERIALIZED (
        SELECT
            document.entry_id,
            'lemma-or-inflection'::text AS resolved_by,
            field.display_text AS matched_text,
            2 AS tier_rank,
            CASE
                WHEN field.display_text = v_raw_query THEN 0
                WHEN field.normalized_text = v_query THEN 1
                ELSE 2
            END AS match_rank,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_fields AS field
        JOIN public.dictionary_search_documents AS document
          ON document.entry_id = field.entry_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=document.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR document.entry_id IN (SELECT entry_id FROM shared_entries))
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND field.field_group = 'form'
          AND (
              v_language_code IS NULL
              OR field.language_code = v_language_code
          )
          AND field.normalized_text = v_query

        UNION ALL

        SELECT
            document.entry_id,
            'lemma-or-inflection'::text,
            field.display_text,
            2,
            CASE
                WHEN field.display_text = v_raw_query THEN 0
                WHEN field.normalized_text = v_query THEN 1
                ELSE 2
            END,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_fields AS field
        JOIN public.dictionary_search_documents AS document
          ON document.entry_id = field.entry_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=document.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR document.entry_id IN (SELECT entry_id FROM shared_entries))
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND field.field_group = 'form'
          AND (
              v_language_code IS NULL
              OR field.language_code = v_language_code
          )
          AND field.normalized_text_unaccent = v_query_unaccent
          AND field.normalized_text <> v_query
    ),
    legacy_user_form_matches AS MATERIALIZED (
        SELECT
            entry.id AS entry_id,
            'lemma-or-inflection'::text AS resolved_by,
            form.form AS matched_text,
            2 AS tier_rank,
            CASE
                WHEN form.form = v_raw_query THEN 0
                WHEN lower(form.form) = lower(v_raw_query) THEN 1
                ELSE 2
            END AS match_rank,
            entry.headword,
            entry.meaning_id,
            entry.dictionary_id
        FROM public.word_forms AS form
        JOIN private.active_word_entries AS entry
          ON entry.id = form.word_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        LEFT JOIN public.dictionary_search_documents AS document
          ON document.entry_id = entry.id
        WHERE entry.id IN (SELECT entry_id FROM selected_entries) AND NOT p_catalog
          AND NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND dictionary.kind = 'user'
          AND document.entry_id IS NULL
          AND (
              v_language_code IS NULL
              OR form.language_code = v_language_code
          )
          AND form.language_code = entry.language_code
          AND (
              form.dictionary_id IS NULL
              OR form.dictionary_id = entry.dictionary_id
          )
          AND (
              lower(form.form) = lower(v_raw_query)
              OR normalize_dictionary_search_text_unaccent(form.form) =
                  v_query_unaccent
          )
    ),
    form_matches AS MATERIALIZED (
        SELECT * FROM indexed_form_matches
        UNION ALL
        SELECT * FROM legacy_user_form_matches
    ),
    form_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (match.entry_id)
            match.*
        FROM form_matches AS match
        ORDER BY
            match.entry_id,
            match.match_rank,
            normalize_dictionary_search_text(match.matched_text)
    ),
    candidates AS MATERIALIZED (
        SELECT * FROM headword_candidates
        UNION ALL
        SELECT * FROM form_candidates
        WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
    ),
    candidate_identity AS MATERIALIZED (
        SELECT
            candidate.*,
            CASE WHEN v_raw_query IS NULL THEN 0 ELSE dictionary.dictionary_rank END AS dictionary_rank,
            COALESCE(
                source_group.id,
                user_group.id
            ) AS headword_group_id
        FROM candidates AS candidate
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = candidate.dictionary_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON binding.word_entry_id = candidate.entry_id
         AND binding.binding_state = 'active'
        LEFT JOIN private.platform_v2_headword_groups AS source_group
          ON source_group.management_kind = 'source'
         AND source_group.dictionary_id = binding.dictionary_id
         AND source_group.identity_scheme_version =
             binding.identity_scheme_version
         AND source_group.source_group_key = binding.source_group_key
        LEFT JOIN private.platform_v2_headword_groups AS user_group
          ON user_group.management_kind = 'user'
         AND user_group.singleton_entry_id = candidate.entry_id
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(normalize_dictionary_search_text(headword))
                AS sort_headword,
            (array_agg(
                resolved_by
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    normalize_dictionary_search_text(headword),
                    entry_id
            ))[1] AS resolved_by,
            (array_agg(
                matched_text
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    normalize_dictionary_search_text(headword),
                    entry_id
            ))[1] AS matched_text
        FROM candidate_identity
        LEFT JOIN candidate_order_ranks order_rank USING (entry_id)
        WHERE headword_group_id IS NOT NULL
        GROUP BY headword_group_id
    ),
    after_cursor AS MATERIALIZED (
        SELECT *
        FROM candidate_groups
        WHERE v_cursor_group_id IS NULL
           OR (
                tier_rank,
                match_rank,
                dictionary_rank,
                sort_headword,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit + 1
    ),
    returned_groups AS MATERIALIZED (
        SELECT *
        FROM after_cursor
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit
    ),
    group_entry_ids AS MATERIALIZED (
        SELECT
            group_page.*,
            entry.id AS entry_id,
            COALESCE(binding.sense_ordinal, entry.meaning_id)
                AS group_meaning_order
        FROM returned_groups AS group_page
        JOIN private.platform_v2_headword_groups AS headword_group
          ON headword_group.id = group_page.headword_group_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON headword_group.management_kind = 'source'
         AND binding.dictionary_id = headword_group.dictionary_id
         AND binding.identity_scheme_version =
             headword_group.identity_scheme_version
         AND binding.source_group_key = headword_group.source_group_key
         AND binding.binding_state = 'active'
        JOIN private.active_word_entries AS entry
          ON entry.id = COALESCE(
              binding.word_entry_id,
              headword_group.singleton_entry_id
          )
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id=entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE private.vocabulary_entry_selected_v1(entry.id,p_library_selection->'vocabulary')
    ),
    group_sizes AS MATERIALIZED (
        SELECT
            headword_group_id,
            count(*)::integer AS entry_count
        FROM group_entry_ids
        GROUP BY headword_group_id
    ),
    oversized_groups AS MATERIALIZED (
        SELECT jsonb_build_object(
            'headwordGroupId', size.headword_group_id,
            'entryCount', size.entry_count,
            'safetyBound', v_group_entry_bound
        ) AS error_payload
        FROM group_sizes AS size
        WHERE size.entry_count > v_group_entry_bound
        ORDER BY size.entry_count DESC, size.headword_group_id
        LIMIT 1
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            entry.*,
            dictionary.language_code AS dictionary_language_code,
            dictionary.slug AS dictionary_slug,
            dictionary.name AS dictionary_name,
            dictionary.kind AS dictionary_kind,
            dictionary.visibility AS dictionary_visibility,
            dictionary.owner_user_id AS dictionary_owner_user_id,
            dictionary.is_editable AS dictionary_is_editable,
            dictionary.schema_key AS dictionary_schema_key,
            dictionary.schema_version AS dictionary_schema_version
        FROM group_entry_ids AS member
        JOIN private.active_word_entries AS entry
          ON entry.id = member.entry_id
        JOIN public.dictionaries AS dictionary
          ON dictionary.id=entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE NOT EXISTS (SELECT 1 FROM oversized_groups)
    ),
    payloads AS (
        SELECT
            jsonb_strip_nulls(jsonb_build_object(
                'id', entry.id,
                'dictionary_id', entry.dictionary_id,
                'language_code', entry.language_code,
                'headword', entry.headword,
                'meaning_id', entry.meaning_id,
                'part_of_speech', entry.part_of_speech,
                'gender', entry.gender,
                'raw', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN private.shared_instructional_raw_v1(entry.raw) ELSE entry.raw END,
                'is_nt2_2000', entry.is_nt2_2000,
                'meanings_count', size.entry_count,
                'dictionary', jsonb_build_object(
                    'id', entry.dictionary_id,
                    'language_code', entry.dictionary_language_code,
                    'slug', entry.dictionary_slug,
                    'name', entry.dictionary_name,
                    'kind', entry.dictionary_kind,
                    'visibility', entry.dictionary_visibility,
                    'owner_user_id',
                        entry.dictionary_owner_user_id,
                    'is_editable', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN false ELSE entry.dictionary_is_editable END,
                    'schema_key', entry.dictionary_schema_key,
                    'schema_version',
                        entry.dictionary_schema_version
                ),
                'dictionary_name', entry.dictionary_name,
                'dictionary_slug', entry.dictionary_slug,
                'dictionary_kind', entry.dictionary_kind,
                'search_match_group', entry.resolved_by,
                'search_matched_text', entry.matched_text
            )) AS payload,
            entry.tier_rank,
            entry.match_rank,
            entry.dictionary_rank,
            entry.sort_headword,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.id
        FROM group_entries AS entry
        JOIN group_sizes AS size
          ON size.headword_group_id = entry.headword_group_id
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    payload
                    ORDER BY
                        tier_rank,
                        match_rank,
                        dictionary_rank,
                        sort_headword,
                        headword_group_id,
                        group_meaning_order,
                        id
                )
                FROM payloads
            ),
            '[]'::jsonb
        ),
        (SELECT count(*) > v_group_limit FROM after_cursor),
        (
            SELECT private.encode_dictionary_search_cursor_v1(
                jsonb_build_object(
                    'version', 'platform-v2-group-cursor-v1',
                    'queryKey', v_query_key,
                    'tierRank', tier_rank,
                    'matchRank', match_rank,
                    'dictionaryRank', dictionary_rank,
                    'sortHeadword', sort_headword,
                    'headwordGroupId', headword_group_id
                )
            )
            FROM returned_groups
            ORDER BY
                tier_rank DESC,
                match_rank DESC,
                dictionary_rank DESC,
                sort_headword DESC,
                headword_group_id DESC
            LIMIT 1
        ),
        (
            SELECT count(*)::integer
            FROM candidate_identity
            WHERE headword_group_id IS NULL
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups;

    IF v_missing_identity_count > 0 THEN
        RETURN jsonb_build_object(
            'error', 'presentation_identity_incomplete'
        );
    END IF;
    IF v_oversized_group IS NOT NULL THEN
        RETURN jsonb_build_object(
            'error', 'group-too-large',
            'group', v_oversized_group
        );
    END IF;

    RETURN jsonb_build_object(
        'query', v_raw_query,
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'totalGroups', v_total_groups,
            'selectedTierComplete', NOT COALESCE(v_has_more, false),
            'nextGroupCursor', CASE
                WHEN COALESCE(v_has_more, false) THEN v_next_cursor
                ELSE NULL
            END
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.lookup_platform_v2_library_material_browse_entries_v1(p_user_id uuid, p_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query text;
    v_query_unaccent text;
    v_language_code text :=
        NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group_limit integer :=
        LEAST(GREATEST(COALESCE(p_group_limit, 10), 1), 25);
    v_group_entry_bound integer :=
        LEAST(GREATEST(COALESCE(p_group_entry_bound, 50), 1), 100);
    v_cursor jsonb :=
        private.decode_dictionary_search_cursor_v1(p_cursor);
    v_query_key text;
    v_cursor_tier_rank integer;
    v_cursor_match_rank integer;
    v_cursor_dictionary_rank integer;
    v_cursor_sort_headword text;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_matching_ids jsonb; v_total_groups integer; v_oversized_group jsonb;
    v_unfiltered boolean := p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary');
BEGIN
    IF p_catalog AND p_user_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF NOT p_catalog AND p_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF v_raw_query IS NOT NULL THEN RETURN jsonb_build_object('error','browse_query_required'); END IF;
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent :=
        normalize_dictionary_search_text_unaccent(v_raw_query);
    v_query_key := encode(
        digest(
            concat_ws(
                chr(31),
                'platform-v2-group-cursor-v1',
                COALESCE(p_user_id::text, 'catalog'),
                p_catalog::text,
                v_raw_query,
                v_query,
                v_query_unaccent,
                COALESCE(v_language_code, ''), p_library_selection::text,private.vocabulary_frequency_revision_v1()
            ),
            'sha256'
        ),
        'hex'
    );

    IF NULLIF(trim(COALESCE(p_cursor, '')), '') IS NOT NULL THEN
        IF v_cursor = '{}'::jsonb
           OR v_cursor->>'version' <> 'platform-v2-group-cursor-v1'
           OR v_cursor->>'queryKey' IS DISTINCT FROM v_query_key THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
        BEGIN
            v_cursor_tier_rank := (v_cursor->>'tierRank')::integer;
            v_cursor_match_rank := (v_cursor->>'matchRank')::integer;
            v_cursor_dictionary_rank :=
                (v_cursor->>'dictionaryRank')::integer;
            v_cursor_sort_headword := v_cursor->>'sortHeadword';
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_sort_headword IS NULL
           OR v_cursor_group_id IS NULL THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
    END IF;

    IF p_catalog
       AND EXISTS (
           SELECT 1
           FROM private.active_word_entries AS entry
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = entry.dictionary_id AND private.entry_access_v1(p_user_id,entry.id,'browse')
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR entry.language_code = v_language_code
             )
           LIMIT 1
       )
       AND NOT EXISTS (
           SELECT 1
           FROM public.dictionary_search_documents AS document
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = document.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR document.language_code = v_language_code
             )
           LIMIT 1
       ) THEN
        RETURN jsonb_build_object('error', 'search_index_not_ready');
    END IF;

    WITH shared_entries AS MATERIALIZED (SELECT entry_id FROM private.shared_author_entry_ids_v1(p_user_id)), material_entries AS MATERIALIZED (SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user_id,p_library_selection->'material')), user_context AS MATERIALIZED (
        SELECT COALESCE(
            (
                SELECT subscription_tier
                FROM public.user_settings
                WHERE user_id = p_user_id
            ),
            'free'
        ) AS subscription_tier
    ),
    eligible_dictionaries AS MATERIALIZED (
      SELECT dictionary.*, CASE WHEN dictionary.kind='user' THEN 0 WHEN dictionary.kind='curated' THEN 1 ELSE 2 END AS dictionary_rank
      FROM public.dictionaries dictionary
      WHERE (
      (public.can_browse_dictionary(p_user_id,dictionary.id)
        AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id))
      OR (dictionary.kind='user' AND EXISTS (
        SELECT 1 FROM material_entries selected
        JOIN private.active_word_entries shared_entry ON shared_entry.id=selected.entry_id
        WHERE shared_entry.dictionary_id=dictionary.id
      )))
        AND private.training_material_entry_selected_v1(dictionary.language_code,
          CASE WHEN dictionary.kind='user' THEN NULL ELSE dictionary.id END,p_library_selection)
    ),
    selected_entries AS MATERIALIZED (
        SELECT chosen.entry_id FROM private.library_selected_entry_ids_v1(p_library_selection,ARRAY(
        SELECT entry.id FROM private.active_word_entries entry
        JOIN eligible_dictionaries dictionary ON dictionary.id=entry.dictionary_id
        WHERE (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
          AND entry.id IN (SELECT entry_id FROM material_entries))) chosen
    ),
    -- Empty browse has one headword tier. Do not sort/deduplicate the same
    -- primary-key document stream through the exact/form search tiers.
    candidates AS MATERIALIZED (
        -- Separate guarded branches also skip wide entry reads in a cached
        -- generic plan, where an optional LEFT JOIN would still scan its heap.
        SELECT document.entry_id, document.headword, document.meaning_id,
            document.dictionary_id, normalize_dictionary_search_text(document.headword) AS sort_headword,
            'exact-headword'::text AS resolved_by, document.headword AS matched_text,
            1 AS tier_rank, CASE WHEN document.normalized_headword=v_query THEN 1 ELSE 2 END AS match_rank
        FROM public.dictionary_search_documents document
        JOIN eligible_dictionaries dictionary ON dictionary.id=document.dictionary_id JOIN material_entries material_member ON material_member.entry_id=document.entry_id
        WHERE v_unfiltered
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
        UNION ALL
        SELECT document.entry_id, document.headword, document.meaning_id,
            document.dictionary_id, normalize_dictionary_search_text(document.headword) AS sort_headword,
            'exact-headword'::text AS resolved_by, document.headword AS matched_text,
            1 AS tier_rank, CASE WHEN document.normalized_headword=v_query THEN 1 ELSE 2 END AS match_rank
        FROM public.dictionary_search_documents document
        JOIN eligible_dictionaries dictionary ON dictionary.id=document.dictionary_id JOIN material_entries material_member ON material_member.entry_id=document.entry_id
        JOIN private.active_word_entries filter_entry ON filter_entry.id=document.entry_id
        WHERE NOT (v_unfiltered)
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
          AND filter_entry.id IN (SELECT entry_id FROM selected_entries)
        UNION ALL
        SELECT entry.id, entry.headword, entry.meaning_id, entry.dictionary_id,
            normalize_dictionary_search_text(entry.headword),
            'exact-headword'::text, entry.headword, 1, 2
        FROM private.active_word_entries entry
        JOIN eligible_dictionaries dictionary ON dictionary.id=entry.dictionary_id JOIN material_entries material_member ON material_member.entry_id=entry.id
        LEFT JOIN public.dictionary_search_documents document ON document.entry_id=entry.id
        WHERE NOT p_catalog AND dictionary.kind='user' AND document.entry_id IS NULL
          AND EXISTS (SELECT 1 FROM eligible_dictionaries WHERE kind='user')
          AND (v_language_code IS NULL OR entry.language_code=v_language_code)
          AND entry.id IN (SELECT entry_id FROM selected_entries)
    ),
    -- Resolve identities in one narrow pass. Candidate CTE cardinality estimates
    -- otherwise turn a catalogue browse into tens of thousands of index probes.
    source_identities AS MATERIALIZED (
        SELECT binding.word_entry_id, source_group.id
        FROM private.source_entry_bindings binding JOIN material_entries material_identity ON material_identity.entry_id=binding.word_entry_id
        JOIN eligible_dictionaries dictionary ON dictionary.id=binding.dictionary_id
        JOIN private.platform_v2_headword_groups source_group
          ON source_group.management_kind='source'
         AND source_group.dictionary_id=binding.dictionary_id
         AND source_group.identity_scheme_version=binding.identity_scheme_version
         AND source_group.source_group_key=binding.source_group_key
        WHERE binding.binding_state='active'
    ),
    candidate_identity AS MATERIALIZED (
        SELECT candidate.*, 0 AS dictionary_rank,
            COALESCE(source_identity.id,user_group.id) AS headword_group_id
        FROM candidates candidate
        LEFT JOIN source_identities source_identity ON source_identity.word_entry_id=candidate.entry_id
        LEFT JOIN private.platform_v2_headword_groups user_group
          ON user_group.management_kind='user' AND user_group.singleton_entry_id=candidate.entry_id
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(sort_headword)
                AS sort_headword,
            (array_agg(
                resolved_by
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    sort_headword,
                    entry_id
            ))[1] AS resolved_by,
            (array_agg(
                matched_text
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    sort_headword,
                    entry_id
            ))[1] AS matched_text
        FROM candidate_identity
        LEFT JOIN candidate_order_ranks order_rank USING (entry_id)
        WHERE headword_group_id IS NOT NULL
        GROUP BY headword_group_id
    ),
    after_cursor AS MATERIALIZED (
        SELECT *
        FROM candidate_groups
        WHERE v_cursor_group_id IS NULL
           OR (
                tier_rank,
                match_rank,
                dictionary_rank,
                sort_headword,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit + 1
    ),
    returned_groups AS MATERIALIZED (
        SELECT *
        FROM after_cursor
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit
    ),
    group_entry_ids AS MATERIALIZED (
        SELECT
            group_page.*,
            entry.id AS entry_id,
            COALESCE(binding.sense_ordinal, entry.meaning_id)
                AS group_meaning_order
        FROM returned_groups AS group_page
        JOIN private.platform_v2_headword_groups AS headword_group
          ON headword_group.id = group_page.headword_group_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON headword_group.management_kind = 'source'
         AND binding.dictionary_id = headword_group.dictionary_id
         AND binding.identity_scheme_version =
             headword_group.identity_scheme_version
         AND binding.source_group_key = headword_group.source_group_key
         AND binding.binding_state = 'active'
        JOIN private.active_word_entries AS entry
          ON entry.id = COALESCE(
              binding.word_entry_id,
              headword_group.singleton_entry_id
          )
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE private.vocabulary_entry_selected_v1(entry.id,p_library_selection->'vocabulary')
    ),
    group_sizes AS MATERIALIZED (
        SELECT
            headword_group_id,
            count(*)::integer AS entry_count
        FROM group_entry_ids
        GROUP BY headword_group_id
    ),
    oversized_groups AS MATERIALIZED (
        SELECT jsonb_build_object(
            'headwordGroupId', size.headword_group_id,
            'entryCount', size.entry_count,
            'safetyBound', v_group_entry_bound
        ) AS error_payload
        FROM group_sizes AS size
        WHERE size.entry_count > v_group_entry_bound
        ORDER BY size.entry_count DESC, size.headword_group_id
        LIMIT 1
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            entry.*,
            dictionary.language_code AS dictionary_language_code,
            dictionary.slug AS dictionary_slug,
            dictionary.name AS dictionary_name,
            dictionary.kind AS dictionary_kind,
            dictionary.visibility AS dictionary_visibility,
            dictionary.owner_user_id AS dictionary_owner_user_id,
            dictionary.is_editable AS dictionary_is_editable,
            dictionary.schema_key AS dictionary_schema_key,
            dictionary.schema_version AS dictionary_schema_version
        FROM group_entry_ids AS member
        JOIN private.active_word_entries AS entry
          ON entry.id = member.entry_id
        JOIN public.dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE NOT EXISTS (SELECT 1 FROM oversized_groups)
    ),
    payloads AS (
        SELECT
            jsonb_strip_nulls(jsonb_build_object(
                'id', entry.id,
                'dictionary_id', entry.dictionary_id,
                'language_code', entry.language_code,
                'headword', entry.headword,
                'meaning_id', entry.meaning_id,
                'part_of_speech', entry.part_of_speech,
                'gender', entry.gender,
                'raw', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN private.shared_instructional_raw_v1(entry.raw) ELSE entry.raw END,
                'is_nt2_2000', entry.is_nt2_2000,
                'meanings_count', size.entry_count,
                'dictionary', jsonb_build_object(
                    'id', entry.dictionary_id,
                    'language_code', entry.dictionary_language_code,
                    'slug', entry.dictionary_slug,
                    'name', entry.dictionary_name,
                    'kind', entry.dictionary_kind,
                    'visibility', entry.dictionary_visibility,
                    'owner_user_id',
                        entry.dictionary_owner_user_id,
                    'is_editable', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN false ELSE entry.dictionary_is_editable END,
                    'schema_key', entry.dictionary_schema_key,
                    'schema_version',
                        entry.dictionary_schema_version
                ),
                'dictionary_name', entry.dictionary_name,
                'dictionary_slug', entry.dictionary_slug,
                'dictionary_kind', entry.dictionary_kind,
                'search_match_group', entry.resolved_by,
                'search_matched_text', entry.matched_text
            )) AS payload,
            entry.tier_rank,
            entry.match_rank,
            entry.dictionary_rank,
            entry.sort_headword,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.id
        FROM group_entries AS entry
        JOIN group_sizes AS size
          ON size.headword_group_id = entry.headword_group_id
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    payload
                    ORDER BY
                        tier_rank,
                        match_rank,
                        dictionary_rank,
                        sort_headword,
                        headword_group_id,
                        group_meaning_order,
                        id
                )
                FROM payloads
            ),
            '[]'::jsonb
        ),
        (SELECT count(*) > v_group_limit FROM after_cursor),
        (
            SELECT private.encode_dictionary_search_cursor_v1(
                jsonb_build_object(
                    'version', 'platform-v2-group-cursor-v1',
                    'queryKey', v_query_key,
                    'tierRank', tier_rank,
                    'matchRank', match_rank,
                    'dictionaryRank', dictionary_rank,
                    'sortHeadword', sort_headword,
                    'headwordGroupId', headword_group_id
                )
            )
            FROM returned_groups
            ORDER BY
                tier_rank DESC,
                match_rank DESC,
                dictionary_rank DESC,
                sort_headword DESC,
                headword_group_id DESC
            LIMIT 1
        ),
        (
            SELECT count(*)::integer
            FROM candidate_identity
            WHERE headword_group_id IS NULL
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups), (SELECT COALESCE(jsonb_agg(DISTINCT candidate.entry_id),'[]'::jsonb) FROM candidate_identity candidate JOIN returned_groups page ON page.headword_group_id=candidate.headword_group_id)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups,v_matching_ids;

    IF v_missing_identity_count > 0 THEN
        RETURN jsonb_build_object(
            'error', 'presentation_identity_incomplete'
        );
    END IF;
    IF v_oversized_group IS NOT NULL THEN
        RETURN jsonb_build_object(
            'error', 'group-too-large',
            'group', v_oversized_group
        );
    END IF;

    RETURN jsonb_build_object(
        'query', v_raw_query,
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'matchingEntryIds', v_matching_ids, 'totalGroups', v_total_groups,
            'selectedTierComplete', NOT COALESCE(v_has_more, false),
            'nextGroupCursor', CASE
                WHEN COALESCE(v_has_more, false) THEN v_next_cursor
                ELSE NULL
            END
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.lookup_platform_v2_library_material_filtered_entries_base_v1(p_user_id uuid, p_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
    v_raw_query text := NULLIF(trim(COALESCE(p_query, '')), '');
    v_query text;
    v_query_unaccent text;
    v_language_code text :=
        NULLIF(trim(COALESCE(p_language_code, '')), '');
    v_group_limit integer :=
        LEAST(GREATEST(COALESCE(p_group_limit, 10), 1), 25);
    v_group_entry_bound integer :=
        LEAST(GREATEST(COALESCE(p_group_entry_bound, 50), 1), 100);
    v_cursor jsonb :=
        private.decode_dictionary_search_cursor_v1(p_cursor);
    v_query_key text;
    v_cursor_tier_rank integer;
    v_cursor_match_rank integer;
    v_cursor_dictionary_rank integer;
    v_cursor_sort_headword text;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_matching_ids jsonb; v_total_groups integer; v_oversized_group jsonb;
    v_unfiltered boolean := p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary');
BEGIN
    IF p_catalog AND p_user_id IS NOT NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF NOT p_catalog AND p_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid_principal');
    END IF;
    IF v_raw_query IS NULL THEN
        RETURN private.lookup_platform_v2_library_material_browse_entries_v1(
            p_user_id,p_catalog,p_query,p_language_code,p_cursor,p_group_limit,p_group_entry_bound,p_library_selection);
    END IF;
    v_query := normalize_dictionary_search_text(v_raw_query);
    v_query_unaccent :=
        normalize_dictionary_search_text_unaccent(v_raw_query);
    v_query_key := encode(
        digest(
            concat_ws(
                chr(31),
                'platform-v2-group-cursor-v1',
                COALESCE(p_user_id::text, 'catalog'),
                p_catalog::text,
                v_raw_query,
                v_query,
                v_query_unaccent,
                COALESCE(v_language_code, ''), p_library_selection::text,private.vocabulary_frequency_revision_v1()
            ),
            'sha256'
        ),
        'hex'
    );

    IF NULLIF(trim(COALESCE(p_cursor, '')), '') IS NOT NULL THEN
        IF v_cursor = '{}'::jsonb
           OR v_cursor->>'version' <> 'platform-v2-group-cursor-v1'
           OR v_cursor->>'queryKey' IS DISTINCT FROM v_query_key THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
        BEGIN
            v_cursor_tier_rank := (v_cursor->>'tierRank')::integer;
            v_cursor_match_rank := (v_cursor->>'matchRank')::integer;
            v_cursor_dictionary_rank :=
                (v_cursor->>'dictionaryRank')::integer;
            v_cursor_sort_headword := v_cursor->>'sortHeadword';
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_sort_headword IS NULL
           OR v_cursor_group_id IS NULL THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END IF;
    END IF;

    IF p_catalog
       AND EXISTS (
           SELECT 1
           FROM private.active_word_entries AS entry
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = entry.dictionary_id AND private.entry_access_v1(p_user_id,entry.id,'browse')
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR entry.language_code = v_language_code
             )
           LIMIT 1
       )
       AND NOT EXISTS (
           SELECT 1
           FROM public.dictionary_search_documents AS document
           JOIN public.dictionaries AS dictionary
             ON dictionary.id = document.dictionary_id
           WHERE dictionary.visibility IN ('system', 'public')
             AND dictionary.kind <> 'user'
             AND (
                 v_language_code IS NULL
                 OR document.language_code = v_language_code
             )
           LIMIT 1
       ) THEN
        RETURN jsonb_build_object('error', 'search_index_not_ready');
    END IF;

    WITH shared_entries AS MATERIALIZED (SELECT entry_id FROM private.shared_author_entry_ids_v1(p_user_id)), material_entries AS MATERIALIZED (SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user_id,p_library_selection->'material')), user_context AS MATERIALIZED (
        SELECT COALESCE(
            (
                SELECT subscription_tier
                FROM public.user_settings
                WHERE user_id = p_user_id
            ),
            'free'
        ) AS subscription_tier
    ),
    eligible_dictionaries AS MATERIALIZED (
      SELECT dictionary.*, CASE WHEN dictionary.kind='user' THEN 0 WHEN dictionary.kind='curated' THEN 1 ELSE 2 END AS dictionary_rank
      FROM public.dictionaries dictionary
      WHERE (
      (public.can_browse_dictionary(p_user_id,dictionary.id)
        AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id))
      OR (dictionary.kind='user' AND EXISTS (
        SELECT 1 FROM material_entries selected
        JOIN private.active_word_entries shared_entry ON shared_entry.id=selected.entry_id
        WHERE shared_entry.dictionary_id=dictionary.id
      )))
        AND private.training_material_entry_selected_v1(dictionary.language_code,
          CASE WHEN dictionary.kind='user' THEN NULL ELSE dictionary.id END,p_library_selection)
    ),
    selected_entries AS MATERIALIZED (
        SELECT chosen.entry_id FROM private.library_selected_entry_ids_v1(p_library_selection,ARRAY(
        SELECT entry.id FROM private.active_word_entries entry
        JOIN eligible_dictionaries dictionary ON dictionary.id=entry.dictionary_id
        WHERE (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
          AND entry.id IN (SELECT entry_id FROM material_entries))) chosen
    ),
    indexed_headword_matches AS MATERIALIZED (
        SELECT
            document.entry_id,
            'exact-headword'::text AS resolved_by,
            document.headword AS matched_text,
            1 AS tier_rank,
            CASE
                WHEN document.headword = v_raw_query THEN 0
                WHEN document.normalized_headword = v_query THEN 1
                ELSE 2
            END AS match_rank,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_documents AS document
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id JOIN material_entries material_member ON material_member.entry_id=document.entry_id
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND (
            v_language_code IS NULL
            OR document.language_code = v_language_code
        )
          AND (v_raw_query IS NULL OR document.normalized_headword = v_query)

        UNION ALL

        SELECT
            document.entry_id,
            'exact-headword'::text,
            document.headword,
            1,
            CASE
                WHEN document.headword = v_raw_query THEN 0
                WHEN document.normalized_headword = v_query THEN 1
                ELSE 2
            END,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_documents AS document
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id JOIN material_entries material_member ON material_member.entry_id=document.entry_id
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND (
            v_language_code IS NULL
            OR document.language_code = v_language_code
        )
          AND document.normalized_headword_unaccent =
              v_query_unaccent
          AND document.normalized_headword <> v_query
    ),
    legacy_user_headword_matches AS MATERIALIZED (
        SELECT
            entry.id AS entry_id,
            'exact-headword'::text AS resolved_by,
            entry.headword AS matched_text,
            1 AS tier_rank,
            CASE
                WHEN entry.headword = v_raw_query THEN 0
                WHEN lower(entry.headword) = lower(v_raw_query) THEN 1
                ELSE 2
            END AS match_rank,
            entry.headword,
            entry.meaning_id,
            entry.dictionary_id
        FROM private.active_word_entries AS entry
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries)) JOIN material_entries material_member ON material_member.entry_id=entry.id
        LEFT JOIN public.dictionary_search_documents AS document
          ON document.entry_id = entry.id
        WHERE entry.id IN (SELECT entry_id FROM selected_entries) AND NOT p_catalog
          AND dictionary.kind = 'user'
          AND document.entry_id IS NULL
          AND (
              v_language_code IS NULL
              OR entry.language_code = v_language_code
          )
          AND (
              v_raw_query IS NULL OR lower(entry.headword) = lower(v_raw_query)
              OR normalize_dictionary_search_text_unaccent(
                  entry.headword
              ) = v_query_unaccent
          )
    ),
    headword_matches AS MATERIALIZED (
        SELECT * FROM indexed_headword_matches
        UNION ALL
        SELECT * FROM legacy_user_headword_matches
    ),
    headword_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (match.entry_id)
            match.*
        FROM headword_matches AS match
        ORDER BY
            match.entry_id,
            match.match_rank,
            normalize_dictionary_search_text(match.headword),
            match.meaning_id
    ),
    indexed_form_matches AS MATERIALIZED (
        SELECT
            document.entry_id,
            'lemma-or-inflection'::text AS resolved_by,
            field.display_text AS matched_text,
            2 AS tier_rank,
            CASE
                WHEN field.display_text = v_raw_query THEN 0
                WHEN field.normalized_text = v_query THEN 1
                ELSE 2
            END AS match_rank,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_fields AS field
        JOIN public.dictionary_search_documents AS document
          ON document.entry_id = field.entry_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id JOIN material_entries material_member ON material_member.entry_id=document.entry_id
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND field.field_group = 'form'
          AND (
              v_language_code IS NULL
              OR field.language_code = v_language_code
          )
          AND field.normalized_text = v_query

        UNION ALL

        SELECT
            document.entry_id,
            'lemma-or-inflection'::text,
            field.display_text,
            2,
            CASE
                WHEN field.display_text = v_raw_query THEN 0
                WHEN field.normalized_text = v_query THEN 1
                ELSE 2
            END,
            document.headword,
            document.meaning_id,
            document.dictionary_id
        FROM public.dictionary_search_fields AS field
        JOIN public.dictionary_search_documents AS document
          ON document.entry_id = field.entry_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = document.dictionary_id JOIN material_entries material_member ON material_member.entry_id=document.entry_id
        JOIN private.active_word_entries AS filter_entry ON filter_entry.id=document.entry_id
        WHERE filter_entry.id IN (SELECT entry_id FROM selected_entries) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND field.field_group = 'form'
          AND (
              v_language_code IS NULL
              OR field.language_code = v_language_code
          )
          AND field.normalized_text_unaccent = v_query_unaccent
          AND field.normalized_text <> v_query
    ),
    legacy_user_form_matches AS MATERIALIZED (
        SELECT
            entry.id AS entry_id,
            'lemma-or-inflection'::text AS resolved_by,
            form.form AS matched_text,
            2 AS tier_rank,
            CASE
                WHEN form.form = v_raw_query THEN 0
                WHEN lower(form.form) = lower(v_raw_query) THEN 1
                ELSE 2
            END AS match_rank,
            entry.headword,
            entry.meaning_id,
            entry.dictionary_id
        FROM public.word_forms AS form
        JOIN private.active_word_entries AS entry
          ON entry.id = form.word_id
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries)) JOIN material_entries material_member ON material_member.entry_id=entry.id
        LEFT JOIN public.dictionary_search_documents AS document
          ON document.entry_id = entry.id
        WHERE entry.id IN (SELECT entry_id FROM selected_entries) AND NOT p_catalog
          AND NOT EXISTS (SELECT 1 FROM headword_candidates)
          AND dictionary.kind = 'user'
          AND document.entry_id IS NULL
          AND (
              v_language_code IS NULL
              OR form.language_code = v_language_code
          )
          AND form.language_code = entry.language_code
          AND (
              form.dictionary_id IS NULL
              OR form.dictionary_id = entry.dictionary_id
          )
          AND (
              lower(form.form) = lower(v_raw_query)
              OR normalize_dictionary_search_text_unaccent(form.form) =
                  v_query_unaccent
          )
    ),
    form_matches AS MATERIALIZED (
        SELECT * FROM indexed_form_matches
        UNION ALL
        SELECT * FROM legacy_user_form_matches
    ),
    form_candidates AS MATERIALIZED (
        SELECT DISTINCT ON (match.entry_id)
            match.*
        FROM form_matches AS match
        ORDER BY
            match.entry_id,
            match.match_rank,
            normalize_dictionary_search_text(match.matched_text)
    ),
    candidates AS MATERIALIZED (
        SELECT * FROM headword_candidates
        UNION ALL
        SELECT * FROM form_candidates
        WHERE NOT EXISTS (SELECT 1 FROM headword_candidates)
    ),
    candidate_identity AS MATERIALIZED (
        SELECT
            candidate.*,
            CASE WHEN v_raw_query IS NULL THEN 0 ELSE dictionary.dictionary_rank END AS dictionary_rank,
            COALESCE(
                source_group.id,
                user_group.id
            ) AS headword_group_id
        FROM candidates AS candidate
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = candidate.dictionary_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON binding.word_entry_id = candidate.entry_id
         AND binding.binding_state = 'active'
        LEFT JOIN private.platform_v2_headword_groups AS source_group
          ON source_group.management_kind = 'source'
         AND source_group.dictionary_id = binding.dictionary_id
         AND source_group.identity_scheme_version =
             binding.identity_scheme_version
         AND source_group.source_group_key = binding.source_group_key
        LEFT JOIN private.platform_v2_headword_groups AS user_group
          ON user_group.management_kind = 'user'
         AND user_group.singleton_entry_id = candidate.entry_id
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(normalize_dictionary_search_text(headword))
                AS sort_headword,
            (array_agg(
                resolved_by
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    normalize_dictionary_search_text(headword),
                    entry_id
            ))[1] AS resolved_by,
            (array_agg(
                matched_text
                ORDER BY
                    tier_rank,
                    match_rank,
                    dictionary_rank,
                    normalize_dictionary_search_text(headword),
                    entry_id
            ))[1] AS matched_text
        FROM candidate_identity
        LEFT JOIN candidate_order_ranks order_rank USING (entry_id)
        WHERE headword_group_id IS NOT NULL
        GROUP BY headword_group_id
    ),
    after_cursor AS MATERIALIZED (
        SELECT *
        FROM candidate_groups
        WHERE v_cursor_group_id IS NULL
           OR (
                tier_rank,
                match_rank,
                dictionary_rank,
                sort_headword,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit + 1
    ),
    returned_groups AS MATERIALIZED (
        SELECT *
        FROM after_cursor
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
            headword_group_id
        LIMIT v_group_limit
    ),
    group_entry_ids AS MATERIALIZED (
        SELECT
            group_page.*,
            entry.id AS entry_id,
            COALESCE(binding.sense_ordinal, entry.meaning_id)
                AS group_meaning_order
        FROM returned_groups AS group_page
        JOIN private.platform_v2_headword_groups AS headword_group
          ON headword_group.id = group_page.headword_group_id
        LEFT JOIN private.source_entry_bindings AS binding
          ON headword_group.management_kind = 'source'
         AND binding.dictionary_id = headword_group.dictionary_id
         AND binding.identity_scheme_version =
             headword_group.identity_scheme_version
         AND binding.source_group_key = headword_group.source_group_key
         AND binding.binding_state = 'active'
        JOIN private.active_word_entries AS entry
          ON entry.id = COALESCE(
              binding.word_entry_id,
              headword_group.singleton_entry_id
          )
        JOIN eligible_dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE private.vocabulary_entry_selected_v1(entry.id,p_library_selection->'vocabulary')
    ),
    group_sizes AS MATERIALIZED (
        SELECT
            headword_group_id,
            count(*)::integer AS entry_count
        FROM group_entry_ids
        GROUP BY headword_group_id
    ),
    oversized_groups AS MATERIALIZED (
        SELECT jsonb_build_object(
            'headwordGroupId', size.headword_group_id,
            'entryCount', size.entry_count,
            'safetyBound', v_group_entry_bound
        ) AS error_payload
        FROM group_sizes AS size
        WHERE size.entry_count > v_group_entry_bound
        ORDER BY size.entry_count DESC, size.headword_group_id
        LIMIT 1
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            entry.*,
            dictionary.language_code AS dictionary_language_code,
            dictionary.slug AS dictionary_slug,
            dictionary.name AS dictionary_name,
            dictionary.kind AS dictionary_kind,
            dictionary.visibility AS dictionary_visibility,
            dictionary.owner_user_id AS dictionary_owner_user_id,
            dictionary.is_editable AS dictionary_is_editable,
            dictionary.schema_key AS dictionary_schema_key,
            dictionary.schema_version AS dictionary_schema_version
        FROM group_entry_ids AS member
        JOIN private.active_word_entries AS entry
          ON entry.id = member.entry_id
        JOIN public.dictionaries AS dictionary
          ON dictionary.id = entry.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR entry.id IN (SELECT entry_id FROM shared_entries))
        WHERE NOT EXISTS (SELECT 1 FROM oversized_groups)
    ),
    payloads AS (
        SELECT
            jsonb_strip_nulls(jsonb_build_object(
                'id', entry.id,
                'dictionary_id', entry.dictionary_id,
                'language_code', entry.language_code,
                'headword', entry.headword,
                'meaning_id', entry.meaning_id,
                'part_of_speech', entry.part_of_speech,
                'gender', entry.gender,
                'raw', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN private.shared_instructional_raw_v1(entry.raw) ELSE entry.raw END,
                'is_nt2_2000', entry.is_nt2_2000,
                'meanings_count', size.entry_count,
                'dictionary', jsonb_build_object(
                    'id', entry.dictionary_id,
                    'language_code', entry.dictionary_language_code,
                    'slug', entry.dictionary_slug,
                    'name', entry.dictionary_name,
                    'kind', entry.dictionary_kind,
                    'visibility', entry.dictionary_visibility,
                    'owner_user_id',
                        entry.dictionary_owner_user_id,
                    'is_editable', CASE
      WHEN entry.dictionary_kind='user' AND entry.dictionary_owner_user_id IS DISTINCT FROM p_user_id
      THEN false ELSE entry.dictionary_is_editable END,
                    'schema_key', entry.dictionary_schema_key,
                    'schema_version',
                        entry.dictionary_schema_version
                ),
                'dictionary_name', entry.dictionary_name,
                'dictionary_slug', entry.dictionary_slug,
                'dictionary_kind', entry.dictionary_kind,
                'search_match_group', entry.resolved_by,
                'search_matched_text', entry.matched_text
            )) AS payload,
            entry.tier_rank,
            entry.match_rank,
            entry.dictionary_rank,
            entry.sort_headword,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.id
        FROM group_entries AS entry
        JOIN group_sizes AS size
          ON size.headword_group_id = entry.headword_group_id
    )
    SELECT
        COALESCE(
            (
                SELECT jsonb_agg(
                    payload
                    ORDER BY
                        tier_rank,
                        match_rank,
                        dictionary_rank,
                        sort_headword,
                        headword_group_id,
                        group_meaning_order,
                        id
                )
                FROM payloads
            ),
            '[]'::jsonb
        ),
        (SELECT count(*) > v_group_limit FROM after_cursor),
        (
            SELECT private.encode_dictionary_search_cursor_v1(
                jsonb_build_object(
                    'version', 'platform-v2-group-cursor-v1',
                    'queryKey', v_query_key,
                    'tierRank', tier_rank,
                    'matchRank', match_rank,
                    'dictionaryRank', dictionary_rank,
                    'sortHeadword', sort_headword,
                    'headwordGroupId', headword_group_id
                )
            )
            FROM returned_groups
            ORDER BY
                tier_rank DESC,
                match_rank DESC,
                dictionary_rank DESC,
                sort_headword DESC,
                headword_group_id DESC
            LIMIT 1
        ),
        (
            SELECT count(*)::integer
            FROM candidate_identity
            WHERE headword_group_id IS NULL
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups), (SELECT COALESCE(jsonb_agg(DISTINCT candidate.entry_id),'[]'::jsonb) FROM candidate_identity candidate JOIN returned_groups page ON page.headword_group_id=candidate.headword_group_id)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups,v_matching_ids;

    IF v_missing_identity_count > 0 THEN
        RETURN jsonb_build_object(
            'error', 'presentation_identity_incomplete'
        );
    END IF;
    IF v_oversized_group IS NOT NULL THEN
        RETURN jsonb_build_object(
            'error', 'group-too-large',
            'group', v_oversized_group
        );
    END IF;

    RETURN jsonb_build_object(
        'query', v_raw_query,
        'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'matchingEntryIds', v_matching_ids, 'totalGroups', v_total_groups,
            'selectedTierComplete', NOT COALESCE(v_has_more, false),
            'nextGroupCursor', CASE
                WHEN COALESCE(v_has_more, false) THEN v_next_cursor
                ELSE NULL
            END
        )
    );
END;
$$;

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
  , authorized AS MATERIALIZED (
  SELECT e.id FROM private.active_word_entries e JOIN dictionaries d ON d.id=e.dictionary_id
  WHERE (d.readable OR (d.kind='user' AND (d.owner_user_id=p_user OR e.id IN (SELECT entry_id FROM shared))))
    AND (NOT (p_selection ? 'material') OR e.id IN (SELECT entry_id FROM material))
  )
  SELECT chosen.entry_id FROM private.library_selected_entry_ids_v1(p_selection,
    ARRAY(SELECT id FROM authorized)) chosen;
$$;
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
    v_limit int := CASE WHEN p_library_selection->'trainingUnpaged'='true'::jsonb THEN 100001 ELSE LEAST(GREATEST(COALESCE(p_limit, 6), 1), 100) END;
    v_cursor jsonb := private.decode_dictionary_search_cursor_v1(p_cursor);
    v_items jsonb := '[]'::jsonb;
    v_group_total integer := 0;
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
        SELECT COUNT(*)::int AS total,COUNT(DISTINCT private.library_entry_group_id_v1(entry_id))::int group_total FROM deduped
    ),
    entry_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM deduped),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    ordered_entries AS MATERIALIZED (
        SELECT d.*,COALESCE(r.sort_rank,0) frequency_sort_rank FROM deduped d
        LEFT JOIN entry_order_ranks r USING (entry_id)
    ),
    page_rows AS (
        SELECT *
        FROM ordered_entries
        WHERE (v_cursor = '{}'::jsonb)
           OR (rank, frequency_sort_rank, normalized_headword, meaning_id, entry_id) >
              (
                COALESCE((v_cursor->>'rank')::int, -1),
                COALESCE(private.vocabulary_order_rank_v1((v_cursor->>'entryId')::uuid,p_library_selection->>'sort'),0),
                COALESCE(v_cursor->>'headwordSort', ''),
                COALESCE((v_cursor->>'meaningId')::int, -1),
                COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              )
        ORDER BY rank, frequency_sort_rank, normalized_headword, meaning_id, entry_id
        LIMIT v_limit + 1
    ),
    visible_page AS (
        SELECT *, row_number() OVER () AS rn FROM page_rows
    ),
    payloads AS (
        SELECT
            CASE WHEN p_library_selection->'trainingUnpaged'='true'::jsonb THEN jsonb_build_object('entry',jsonb_build_object('id',entry_id)) ELSE
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
            ) END AS payload,
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
        counted.total, counted.group_total,
        COALESCE(jsonb_agg(payload ORDER BY rn), '[]'::jsonb),
        EXISTS(SELECT 1 FROM visible_page WHERE rn > v_limit),
        (array_agg(cursor_payload ORDER BY rn DESC))[1]
    INTO v_total, v_group_total, v_items, v_has_more, v_last
    FROM counted
    LEFT JOIN payloads ON true
    GROUP BY counted.total,counted.group_total;

    IF v_has_more AND v_last IS NOT NULL THEN
        v_next_cursor := private.encode_dictionary_search_cursor_v1(v_last);
    END IF;

    RETURN jsonb_build_object(
        'id', 'headwords',
        'total', COALESCE(v_total, 0),
        'count', jsonb_build_object('value', COALESCE(v_total, 0), 'relation', 'eq'),
        'wordGroupCount',COALESCE(v_group_total,0),'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object('limit', v_limit, 'nextCursor', v_next_cursor, 'hasMore', COALESCE(v_has_more, false))
    );
END;
$$;


CREATE OR REPLACE FUNCTION private.search_library_body_v1(p_user_id uuid, p_public_catalog boolean, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_group text DEFAULT 'examples'::text, p_limit integer DEFAULT 6, p_cursor text DEFAULT NULL::text, p_library_selection jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    SET plan_cache_mode TO 'force_custom_plan'
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
    v_limit int := CASE WHEN p_library_selection->'trainingUnpaged'='true'::jsonb THEN 100001 ELSE LEAST(GREATEST(COALESCE(p_limit, 6), 1), 100) END;
    v_cursor jsonb := private.decode_dictionary_search_cursor_v1(p_cursor);
    v_items jsonb := '[]'::jsonb;
    v_has_more boolean := false;
    v_next_cursor text := NULL;
    v_last jsonb;
    v_selected_ids uuid[];
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

    v_selected_ids := ARRAY(SELECT entry_id FROM private.library_category_entry_ids_v1(p_user_id,p_library_selection));

    IF length(v_query_unaccent) >= 3 THEN
        WITH matching_entries AS MATERIALIZED (
            SELECT DISTINCT f.entry_id
            FROM dictionary_search_fields f
            JOIN dictionaries d ON d.id = f.dictionary_id
            WHERE f.entry_id IN (SELECT unnest(v_selected_ids) AS entry_id)
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
            WHERE f.entry_id IN (SELECT unnest(v_selected_ids) AS entry_id)
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
        SELECT unnest(v_selected_ids) AS entry_id
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
            CASE WHEN p_library_selection->'trainingUnpaged'='true'::jsonb THEN jsonb_build_object('entry',jsonb_build_object('id',entry_id)) ELSE
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
            ) END AS payload,
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


NOTIFY pgrst, 'reload schema';
COMMIT;
