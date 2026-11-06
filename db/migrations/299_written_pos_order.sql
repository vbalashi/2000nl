BEGIN;
SELECT public.similarity('', '');
-- Optional operator-supplied observations. No corpus data ships with the app.
CREATE TABLE private.vocabulary_written_pos_profiles (
 language_code text PRIMARY KEY,
 revision text NOT NULL CHECK(length(revision) BETWEEN 1 AND 128),
 loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.vocabulary_written_pos_frequencies (
 language_code text NOT NULL REFERENCES private.vocabulary_written_pos_profiles(language_code) ON DELETE CASCADE,
 spelling_key text NOT NULL CHECK(length(spelling_key) BETWEEN 1 AND 512 AND spelling_key=private.vocabulary_spelling_key_v1(spelling_key)),
 part_of_speech text NOT NULL CHECK(part_of_speech IN ('zn','ww','bn','bw','vz','vnw','vw','tw','lidw','tsw','afk','vv')),
 count bigint NOT NULL CHECK(count>0),
 PRIMARY KEY(language_code,spelling_key,part_of_speech)
);
ALTER TABLE private.vocabulary_written_pos_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.vocabulary_written_pos_frequencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.vocabulary_written_pos_profiles,private.vocabulary_written_pos_frequencies FROM PUBLIC,anon,authenticated,service_role;

-- Negative counts put observed POS first; zero preserves existing ties for unknowns.
-- Only ranked spellings participate: unknown spellings never gain global priority.
CREATE FUNCTION private.vocabulary_written_pos_orders_v1(p_entry_ids uuid[],p_sort text)
RETURNS TABLE(entry_id uuid,pos_order bigint) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp SET enable_nestloop=on AS $$
 WITH requested AS MATERIALIZED (SELECT DISTINCT unnest(p_entry_ids) id),
 entries AS MATERIALIZED (
  SELECT e.id,e.language_code,private.vocabulary_spelling_key_v1(e.headword) spelling_key,
   private.normalize_training_part_of_speech_v1(e.part_of_speech) part_of_speech
  FROM requested r JOIN private.active_word_entries e ON e.id=r.id
  JOIN public.dictionaries d ON d.id=e.dictionary_id AND d.kind<>'user' WHERE p_sort='written'
 ), observed AS MATERIALIZED (
  SELECT e.id,-o.count AS pos_order FROM entries e
  JOIN private.vocabulary_frequency_ranks rank ON rank.language_code=e.language_code
   AND rank.profile='written' AND rank.spelling_key=e.spelling_key
  JOIN private.vocabulary_written_pos_frequencies o ON o.language_code=e.language_code
   AND o.spelling_key=e.spelling_key AND o.part_of_speech=e.part_of_speech
 )
 SELECT r.id,COALESCE(o.pos_order,0::bigint) FROM requested r LEFT JOIN observed o ON o.id=r.id;
$$;
CREATE FUNCTION private.vocabulary_written_pos_order_v1(p_entry_id uuid,p_sort text) RETURNS bigint
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT pos_order FROM private.vocabulary_written_pos_orders_v1(ARRAY[p_entry_id],p_sort);
$$;
REVOKE ALL ON FUNCTION private.vocabulary_written_pos_order_v1(uuid,text),private.vocabulary_written_pos_orders_v1(uuid[],text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.vocabulary_frequency_revision_v1() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT md5(jsonb_build_array(
 (SELECT COALESCE(jsonb_agg(jsonb_build_array(language_code,profile,revision) ORDER BY language_code,profile),'[]'::jsonb) FROM private.vocabulary_frequency_profiles),
 (SELECT COALESCE(jsonb_agg(jsonb_build_array(language_code,revision) ORDER BY language_code),'[]'::jsonb) FROM private.vocabulary_written_pos_profiles)
 )::text);
$$;

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
    v_cursor_pos_order bigint;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_total_groups integer; v_total_meanings integer; v_oversized_group jsonb;
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
            v_cursor_pos_order := (v_cursor->>'posOrder')::bigint;
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_pos_order IS NULL OR v_cursor_sort_headword IS NULL
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
    -- Both counters share the already filtered identity set before pagination.
    -- Full-article expansion below must never increase the selected meaning count.
    candidate_counts AS MATERIALIZED (
        SELECT count(*) FILTER (WHERE headword_group_id IS NULL)::integer AS missing_identity_count,
            count(DISTINCT entry_id) FILTER (WHERE headword_group_id IS NOT NULL)::integer AS total_meanings
        FROM candidate_identity
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(sort_headword)
                AS sort_headword,
            min(candidate_pos.pos_order) AS pos_order,
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
        LEFT JOIN candidate_pos_orders candidate_pos USING (entry_id)
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
                pos_order,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_pos_order,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
                pos_order,
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
                pos_order,
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
    member_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM group_entry_ids),p_library_selection->>'sort')
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.pos_order,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            member_pos.pos_order AS entry_pos_order,
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
        JOIN member_pos_orders member_pos USING (entry_id)
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
            entry.pos_order,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.entry_pos_order,
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
                pos_order,
                        headword_group_id,
                        entry_pos_order,
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
                    'posOrder', pos_order,
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
            SELECT missing_identity_count FROM candidate_counts
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups), (SELECT total_meanings FROM candidate_counts)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups,v_total_meanings;

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
            'totalGroups', v_total_groups, 'totalMeanings', v_total_meanings,
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
    v_cursor_pos_order bigint;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_total_groups integer; v_total_meanings integer; v_oversized_group jsonb;
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
            v_cursor_pos_order := (v_cursor->>'posOrder')::bigint;
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_pos_order IS NULL OR v_cursor_sort_headword IS NULL
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
    -- Both counters share the already filtered identity set before pagination.
    -- Full-article expansion below must never increase the selected meaning count.
    candidate_counts AS MATERIALIZED (
        SELECT count(*) FILTER (WHERE headword_group_id IS NULL)::integer AS missing_identity_count,
            count(DISTINCT entry_id) FILTER (WHERE headword_group_id IS NOT NULL)::integer AS total_meanings
        FROM candidate_identity
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(normalize_dictionary_search_text(headword))
                AS sort_headword,
            min(candidate_pos.pos_order) AS pos_order,
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
        LEFT JOIN candidate_pos_orders candidate_pos USING (entry_id)
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
                pos_order,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_pos_order,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
                pos_order,
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
                pos_order,
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
    member_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM group_entry_ids),p_library_selection->>'sort')
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.pos_order,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            member_pos.pos_order AS entry_pos_order,
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
        JOIN member_pos_orders member_pos USING (entry_id)
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
            entry.pos_order,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.entry_pos_order,
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
                pos_order,
                        headword_group_id,
                        entry_pos_order,
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
                    'posOrder', pos_order,
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
            SELECT missing_identity_count FROM candidate_counts
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups), (SELECT total_meanings FROM candidate_counts)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups,v_total_meanings;

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
            'totalGroups', v_total_groups, 'totalMeanings', v_total_meanings,
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
    v_cursor_pos_order bigint;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_matching_ids jsonb; v_total_groups integer; v_total_meanings integer; v_oversized_group jsonb;
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
            v_cursor_pos_order := (v_cursor->>'posOrder')::bigint;
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_pos_order IS NULL OR v_cursor_sort_headword IS NULL
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
    -- Both counters share the already filtered identity set before pagination.
    -- Full-article expansion below must never increase the selected meaning count.
    candidate_counts AS MATERIALIZED (
        SELECT count(*) FILTER (WHERE headword_group_id IS NULL)::integer AS missing_identity_count,
            count(DISTINCT entry_id) FILTER (WHERE headword_group_id IS NOT NULL)::integer AS total_meanings
        FROM candidate_identity
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(sort_headword)
                AS sort_headword,
            min(candidate_pos.pos_order) AS pos_order,
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
        LEFT JOIN candidate_pos_orders candidate_pos USING (entry_id)
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
                pos_order,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_pos_order,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
                pos_order,
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
                pos_order,
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
    member_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM group_entry_ids),p_library_selection->>'sort')
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.pos_order,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            member_pos.pos_order AS entry_pos_order,
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
        JOIN member_pos_orders member_pos USING (entry_id)
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
            entry.pos_order,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.entry_pos_order,
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
                pos_order,
                        headword_group_id,
                        entry_pos_order,
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
                    'posOrder', pos_order,
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
            SELECT missing_identity_count FROM candidate_counts
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups), (SELECT total_meanings FROM candidate_counts), (SELECT COALESCE(jsonb_agg(DISTINCT candidate.entry_id),'[]'::jsonb) FROM candidate_identity candidate JOIN returned_groups page ON page.headword_group_id=candidate.headword_group_id)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups,v_total_meanings,v_matching_ids;

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
            'matchingEntryIds', v_matching_ids, 'totalGroups', v_total_groups, 'totalMeanings', v_total_meanings,
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
    v_cursor_pos_order bigint;
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_matching_ids jsonb; v_total_groups integer; v_total_meanings integer; v_oversized_group jsonb;
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
            v_cursor_pos_order := (v_cursor->>'posOrder')::bigint;
            v_cursor_group_id := (v_cursor->>'headwordGroupId')::uuid;
        EXCEPTION WHEN others THEN
            RETURN jsonb_build_object('error', 'invalid_cursor');
        END;
        IF v_cursor_pos_order IS NULL OR v_cursor_sort_headword IS NULL
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
    -- Both counters share the already filtered identity set before pagination.
    -- Full-article expansion below must never increase the selected meaning count.
    candidate_counts AS MATERIALIZED (
        SELECT count(*) FILTER (WHERE headword_group_id IS NULL)::integer AS missing_identity_count,
            count(DISTINCT entry_id) FILTER (WHERE headword_group_id IS NOT NULL)::integer AS total_meanings
        FROM candidate_identity
    ),
    candidate_order_ranks AS MATERIALIZED (
        SELECT ranked.* FROM private.library_entry_order_ranks_v1(
            ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort') ranked
        WHERE p_library_selection->>'sort' IN ('spoken','written')
    ),
    candidate_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM candidate_identity),p_library_selection->>'sort')
    ),
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN order_rank.sort_rank END),min(dictionary_rank)) AS dictionary_rank,
            min(normalize_dictionary_search_text(headword))
                AS sort_headword,
            min(candidate_pos.pos_order) AS pos_order,
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
        LEFT JOIN candidate_pos_orders candidate_pos USING (entry_id)
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
                pos_order,
                headword_group_id
           ) > (
                v_cursor_tier_rank,
                v_cursor_match_rank,
                v_cursor_dictionary_rank,
                v_cursor_sort_headword,
                v_cursor_pos_order,
                v_cursor_group_id
           )
        ORDER BY
            tier_rank,
            match_rank,
            dictionary_rank,
            sort_headword,
                pos_order,
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
                pos_order,
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
    member_pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM group_entry_ids),p_library_selection->>'sort')
    ),
    group_entries AS MATERIALIZED (
        SELECT
            member.tier_rank,
            member.match_rank,
            member.dictionary_rank,
            member.sort_headword,
            member.pos_order,
            member.resolved_by,
            member.matched_text,
            member.headword_group_id,
            member.group_meaning_order,
            member_pos.pos_order AS entry_pos_order,
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
        JOIN member_pos_orders member_pos USING (entry_id)
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
            entry.pos_order,
            entry.headword_group_id,
            entry.group_meaning_order,
            entry.entry_pos_order,
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
                pos_order,
                        headword_group_id,
                        entry_pos_order,
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
                    'posOrder', pos_order,
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
            SELECT missing_identity_count FROM candidate_counts
        ),
        (
            SELECT error_payload
            FROM oversized_groups
        ), (SELECT count(*)::integer FROM candidate_groups), (SELECT total_meanings FROM candidate_counts), (SELECT COALESCE(jsonb_agg(DISTINCT candidate.entry_id),'[]'::jsonb) FROM candidate_identity candidate JOIN returned_groups page ON page.headword_group_id=candidate.headword_group_id)
    INTO
        v_items,
        v_has_more,
        v_next_cursor,
        v_missing_identity_count,
        v_oversized_group,v_total_groups,v_total_meanings,v_matching_ids;

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
            'matchingEntryIds', v_matching_ids, 'totalGroups', v_total_groups, 'totalMeanings', v_total_meanings,
            'selectedTierComplete', NOT COALESCE(v_has_more, false),
            'nextGroupCursor', CASE
                WHEN COALESCE(v_has_more, false) THEN v_next_cursor
                ELSE NULL
            END
        )
    );
END;
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
    pos_orders AS MATERIALIZED (
        SELECT * FROM private.vocabulary_written_pos_orders_v1(ARRAY(SELECT entry_id FROM deduped),p_library_selection->>'sort')
    ),
    ordered_entries AS MATERIALIZED (
        SELECT d.*,pos.pos_order,COALESCE(r.sort_rank,0) frequency_sort_rank FROM deduped d
        JOIN pos_orders pos USING (entry_id)
        LEFT JOIN entry_order_ranks r USING (entry_id)
    ),
    page_rows AS (
        SELECT *
        FROM ordered_entries
        WHERE (v_cursor = '{}'::jsonb)
           OR (rank, frequency_sort_rank, normalized_headword, pos_order, meaning_id, entry_id) >
              (
                COALESCE((v_cursor->>'rank')::int, -1),
                COALESCE(private.vocabulary_order_rank_v1((v_cursor->>'entryId')::uuid,p_library_selection->>'sort'),0),
                COALESCE(v_cursor->>'headwordSort', ''),
                private.vocabulary_written_pos_order_v1((v_cursor->>'entryId')::uuid,p_library_selection->>'sort'),
                COALESCE((v_cursor->>'meaningId')::int, -1),
                COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              )
        ORDER BY rank, frequency_sort_rank, normalized_headword, pos_order, meaning_id, entry_id
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

CREATE OR REPLACE FUNCTION public.fetch_library_collection_entries(p_list_id uuid, p_list_type text, p_filters jsonb, p_query text DEFAULT NULL::text, p_language_code text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
  principal uuid := (select auth.uid());
  parts jsonb;
  selection jsonb;
  article text;
  maximum integer;
  page_offset bigint;
  page_limit integer;
  payload jsonb;
BEGIN
  IF principal IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_list_id IS NULL OR p_list_type IS NULL OR p_list_type NOT IN ('user','curated')
     OR p_page IS NULL OR p_page < 1 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_language_code IS NOT NULL AND (length(p_language_code) NOT BETWEEN 2 AND 16))
     OR length(COALESCE(p_query,'')) > 1000 THEN
    RAISE EXCEPTION 'invalid_collection_scope' USING ERRCODE = '22023';
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters) <> 'object' THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) k WHERE k NOT IN ('parts','article','vocabulary','sort')) THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  IF NOT private.valid_vocabulary_selection_v1(p_filters->'vocabulary') OR (p_filters ? 'sort' AND (jsonb_typeof(p_filters->'sort')<>'string' OR p_filters->>'sort' NOT IN ('alphabetical','spoken','written'))) THEN RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE='22023'; END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts) <> 'array' THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(parts) > 12 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(parts) x WHERE jsonb_typeof(x) <> 'string'
    OR x #>> '{}' NOT IN ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')
  ) THEN RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023'; END IF;
  article := p_filters->>'article';
  IF article IS NOT NULL AND (article NOT IN ('de','het') OR NOT (parts ? 'noun')) THEN
    RAISE EXCEPTION 'invalid_library_filters' USING ERRCODE = '22023';
  END IF;
  selection := jsonb_build_object('parts',parts,'article',article,'vocabulary',p_filters->'vocabulary','sort',p_filters->>'sort');
  maximum := CASE WHEN public.get_user_tier(principal) IN ('premium','admin') THEN NULL ELSE 100 END;
  page_offset := (p_page::bigint - 1) * p_page_size;
  page_limit := GREATEST(0,LEAST(p_page_size,COALESCE(maximum::bigint-page_offset,p_page_size)))::integer;

  -- Resolve membership and ownership once; no client-supplied principal and no
  -- filtering of a previously paginated result. Both count and items use scoped.
  WITH members AS MATERIALIZED (
    SELECT li.word_id, COALESCE(li.rank,999999) AS sort_rank, NULL::timestamptz AS added_at
    FROM public.word_list_items li
    WHERE p_list_type='curated' AND li.list_id=p_list_id
    UNION ALL
    SELECT li.word_id, 0 AS sort_rank, li.added_at
    FROM public.user_word_list_items li
    JOIN public.user_word_lists list ON list.id=li.list_id AND list.user_id=principal
    WHERE p_list_type='user' AND li.list_id=p_list_id
  ), scoped AS MATERIALIZED (
    SELECT w.id,w.dictionary_id,w.language_code,w.headword,w.part_of_speech,w.gender,w.raw,w.is_nt2_2000,private.vocabulary_written_pos_order_v1(w.id,p_filters->>'sort') AS pos_order,
           CASE WHEN p_filters->>'sort'='alphabetical' THEN 0 ELSE COALESCE(private.vocabulary_order_rank_v1(w.id,p_filters->>'sort'),members.sort_rank) END sort_rank,CASE WHEN p_filters?'sort' THEN NULL::timestamptz ELSE members.added_at END added_at
    FROM members JOIN private.active_word_entries w ON w.id=members.word_id
    WHERE (w.dictionary_id IS NULL OR public.can_browse_dictionary(principal,w.dictionary_id))
      AND (p_language_code IS NULL OR w.language_code=p_language_code)
      AND (NULLIF(trim(p_query),'') IS NULL OR w.headword ILIKE '%' || trim(p_query) || '%')
      AND private.library_entry_selection_matches_v1(w.id,w.part_of_speech,w.gender,selection)
  ), page AS (
    SELECT * FROM scoped
    ORDER BY sort_rank ASC,added_at DESC NULLS LAST,headword ASC,pos_order ASC,id ASC
    OFFSET page_offset LIMIT page_limit
  )
  SELECT jsonb_build_object(
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY sort_rank ASC,added_at DESC NULLS LAST,headword ASC,pos_order ASC,id ASC) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM scoped),
    'is_locked',maximum IS NOT NULL AND page_offset>=maximum,
    'max_allowed',maximum
  ) INTO payload;
  RETURN payload;
END;
$$;

COMMIT;
