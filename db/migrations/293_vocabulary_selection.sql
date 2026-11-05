BEGIN;
-- Application-owned vocabulary selection; frequency data is supplied separately.
CREATE TABLE private.vocabulary_frequency_profiles (
 language_code text NOT NULL, profile text NOT NULL CHECK(profile IN ('spoken','written')),
 revision text NOT NULL CHECK(length(revision) BETWEEN 1 AND 128),
 max_rank integer NOT NULL CHECK(max_rank>0), loaded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(language_code,profile)
);
CREATE TABLE private.vocabulary_frequency_ranks (
 language_code text NOT NULL, profile text NOT NULL, spelling_key text NOT NULL CHECK(length(spelling_key) BETWEEN 1 AND 512),
 rank integer NOT NULL CHECK(rank>0),
 PRIMARY KEY(language_code,profile,spelling_key), UNIQUE(language_code,profile,rank),
 FOREIGN KEY(language_code,profile) REFERENCES private.vocabulary_frequency_profiles(language_code,profile) ON DELETE CASCADE
);
ALTER TABLE private.vocabulary_frequency_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.vocabulary_frequency_ranks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.vocabulary_frequency_profiles,private.vocabulary_frequency_ranks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.vocabulary_spelling_key_v1(p_value text) RETURNS text
 LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,pg_temp AS $$
 SELECT lower(normalize(btrim(p_value),NFC));
$$;

CREATE FUNCTION private.valid_vocabulary_selection_v1(p_value jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_value IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(p_value)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>6
  OR NOT(p_value ?& ARRAY['mode','materialKinds','profile','from','to','meanings'])
  OR p_value->>'mode' NOT IN ('all','frequency') OR p_value->>'profile' NOT IN ('spoken','written')
  OR jsonb_typeof(p_value->'mode')<>'string' OR jsonb_typeof(p_value->'profile')<>'string'
  OR jsonb_typeof(p_value->'from')<>'number' OR jsonb_typeof(p_value->'to')<>'number'
  OR p_value->>'from' !~ '^[1-9][0-9]{0,15}$' OR p_value->>'to' !~ '^[1-9][0-9]{0,15}$'
  OR (p_value->>'to')::bigint>9007199254740991 OR (p_value->>'from')::bigint>(p_value->>'to')::bigint
  OR NOT(p_value->'meanings' IN ('1'::jsonb,'2'::jsonb,'3'::jsonb,'"all"'::jsonb))
  OR jsonb_typeof(p_value->'materialKinds')<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_value->'materialKinds')>1 OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_value->'materialKinds') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN ('word','other')) THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;
CREATE FUNCTION private.vocabulary_has_selection_v1(p_value jsonb) RETURNS boolean
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT COALESCE(p_value->>'mode'='frequency' OR p_value->>'meanings'<>'all' OR p_value->'materialKinds'<>'[]'::jsonb,false);
$$;

CREATE FUNCTION private.vocabulary_entry_selected_v1(p_entry_id uuid,p_value jsonb) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE
 e public.word_entries%rowtype; binding private.source_entry_bindings%rowtype;
 kind text; unit_part text; limit_count integer; prior_count integer;
BEGIN
 IF p_value IS NULL OR p_value='null'::jsonb THEN RETURN true; END IF;
 IF NOT private.valid_vocabulary_selection_v1(p_value) THEN RETURN false; END IF;
 IF NOT private.vocabulary_has_selection_v1(p_value) THEN RETURN true; END IF;
 SELECT * INTO e FROM private.active_word_entries WHERE id=p_entry_id;
 IF NOT FOUND THEN RETURN false; END IF;
 kind:=CASE WHEN private.normalize_training_part_of_speech_v1(e.part_of_speech) IS NOT NULL THEN 'word' ELSE 'other' END;
 IF jsonb_array_length(p_value->'materialKinds')>0 AND NOT(p_value->'materialKinds' ? kind) THEN RETURN false; END IF;
 IF p_value->>'mode'='frequency' AND NOT EXISTS(
  SELECT 1 FROM private.vocabulary_frequency_ranks rank WHERE EXISTS(SELECT 1 FROM public.dictionaries d WHERE d.id=e.dictionary_id AND d.kind<>'user') AND rank.language_code=e.language_code
   AND rank.profile=p_value->>'profile' AND rank.spelling_key=private.vocabulary_spelling_key_v1(e.headword)
   AND rank.rank BETWEEN (p_value->>'from')::bigint AND (p_value->>'to')::bigint) THEN RETURN false; END IF;
 IF p_value->>'meanings'='all' THEN RETURN true; END IF;
 IF private.is_pointer_only_dictionary_entry_v1(e.raw) THEN RETURN false; END IF;
 limit_count:=(p_value->>'meanings')::integer;
 unit_part:=COALESCE(private.normalize_training_part_of_speech_v1(e.part_of_speech),lower(btrim(e.part_of_speech)),'');
 SELECT * INTO binding FROM private.source_entry_bindings WHERE word_entry_id=e.id AND binding_state='active' ORDER BY source_entry_key LIMIT 1;
 IF FOUND THEN
  SELECT count(*) INTO prior_count FROM (
   SELECT 1 FROM private.source_entry_bindings sibling
   JOIN private.active_word_entries w ON w.id=sibling.word_entry_id
   WHERE sibling.dictionary_id=binding.dictionary_id AND sibling.identity_scheme_version=binding.identity_scheme_version
    AND sibling.source_group_key=binding.source_group_key AND sibling.binding_state='active'
    AND COALESCE(private.normalize_training_part_of_speech_v1(w.part_of_speech),lower(btrim(w.part_of_speech)),'')=unit_part
    AND NOT private.is_pointer_only_dictionary_entry_v1(w.raw)
    AND (COALESCE(sibling.sense_ordinal,w.meaning_id,2147483647),w.id)<=(COALESCE(binding.sense_ordinal,e.meaning_id,2147483647),e.id)
   LIMIT limit_count+1
  ) previous;
 ELSIF EXISTS(SELECT 1 FROM private.platform_v2_headword_groups WHERE management_kind='user' AND singleton_entry_id=e.id) THEN
  RETURN true;
 ELSE
  SELECT count(*) INTO prior_count FROM (
   SELECT 1 FROM private.active_word_entries w WHERE w.dictionary_id IS NOT DISTINCT FROM e.dictionary_id
    AND w.language_code=e.language_code AND w.headword=e.headword
    AND COALESCE(private.normalize_training_part_of_speech_v1(w.part_of_speech),lower(btrim(w.part_of_speech)),'')=unit_part
    AND NOT private.is_pointer_only_dictionary_entry_v1(w.raw)
    AND (COALESCE(w.meaning_id,2147483647),w.id)<=(COALESCE(e.meaning_id,2147483647),e.id)
   LIMIT limit_count+1
  ) previous;
 END IF;
 RETURN prior_count<=limit_count;
END;
$$;

CREATE FUNCTION private.vocabulary_order_rank_v1(p_entry_id uuid,p_sort text) RETURNS integer
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT CASE WHEN p_sort IN ('spoken','written') THEN COALESCE((
  SELECT rank.rank FROM private.active_word_entries e JOIN private.vocabulary_frequency_ranks rank
   ON rank.language_code=e.language_code AND rank.profile=p_sort AND rank.spelling_key=private.vocabulary_spelling_key_v1(e.headword)
  WHERE e.id=p_entry_id AND EXISTS(SELECT 1 FROM public.dictionaries d WHERE d.id=e.dictionary_id AND d.kind<>'user')),2147483647) END;
$$;
CREATE FUNCTION private.library_entry_selection_matches_v1(p_entry_id uuid,p_part text,p_gender text,p_selection jsonb) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT private.vocabulary_entry_selected_v1(p_entry_id,p_selection->'vocabulary') AND
  (p_selection#>'{vocabulary,materialKinds}'='["other"]'::jsonb OR private.library_entry_matches_filters_v1(p_part,p_gender,p_selection));
$$;
REVOKE ALL ON FUNCTION private.vocabulary_spelling_key_v1(text),private.valid_vocabulary_selection_v1(jsonb),private.vocabulary_has_selection_v1(jsonb),private.vocabulary_entry_selected_v1(uuid,jsonb),private.vocabulary_order_rank_v1(uuid,text),private.library_entry_selection_matches_v1(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;


CREATE FUNCTION private.vocabulary_frequency_revision_v1() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT md5(COALESCE(string_agg(language_code||':'||profile||':'||revision,',' ORDER BY language_code,profile),'')) FROM private.vocabulary_frequency_profiles;
$$;
REVOKE ALL ON FUNCTION private.vocabulary_frequency_revision_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.normalize_training_part_of_speech_v1(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
  SELECT CASE lower(trim(regexp_replace(COALESCE(p_value, ''), '[().;:, ]+$', '', 'g')))
    WHEN 'zn' THEN 'zn' WHEN 'znw' THEN 'zn' WHEN 'zelfstandig naamwoord' THEN 'zn'
    WHEN 'ww' THEN 'ww' WHEN 'werkwoord' THEN 'ww'
    WHEN 'bn' THEN 'bn' WHEN 'bijvoeglijk naamwoord' THEN 'bn'
    WHEN 'bw' THEN 'bw' WHEN 'bijwoord' THEN 'bw'
    WHEN 'vz' THEN 'vz' WHEN 'voorzetsel' THEN 'vz'
    WHEN 'vnw' THEN 'vnw' WHEN 'voornaamwoord' THEN 'vnw'
    WHEN 'vw' THEN 'vw' WHEN 'voegwoord' THEN 'vw'
    WHEN 'tw' THEN 'tw' WHEN 'telwoord' THEN 'tw'
    WHEN 'lidw' THEN 'lidw' WHEN 'lidwoord' THEN 'lidw'
    WHEN 'tsw' THEN 'tsw' WHEN 'tussenwerpsel' THEN 'tsw'
    WHEN 'vv' THEN 'vv' WHEN 'voorvoegsel' THEN 'vv' WHEN 'prefix' THEN 'vv'
    WHEN 'noun' THEN 'zn' WHEN 'verb' THEN 'ww' WHEN 'adjective' THEN 'bn' WHEN 'adverb' THEN 'bw'
    WHEN 'preposition' THEN 'vz' WHEN 'pronoun' THEN 'vnw' WHEN 'conjunction' THEN 'vw' WHEN 'numeral' THEN 'tw'
    WHEN 'article' THEN 'lidw' WHEN 'interjection' THEN 'tsw' WHEN 'abbreviation' THEN 'afk'
    WHEN 'afk' THEN 'afk' WHEN 'afkorting' THEN 'afk'
    ELSE NULL
  END;
$_$;

CREATE INDEX word_entries_vocabulary_unit_v1_idx ON public.word_entries(language_code,headword,(COALESCE(private.normalize_training_part_of_speech_v1(part_of_speech),lower(btrim(part_of_speech)),'')),meaning_id,id);

CREATE OR REPLACE FUNCTION private.library_entry_matches_filters_v1(p_part text,p_gender text,p_selection jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog,private,pg_temp AS $$
 WITH normalized AS (SELECT CASE private.normalize_training_part_of_speech_v1(p_part)
 WHEN 'zn' THEN 'noun' WHEN 'ww' THEN 'verb' WHEN 'bn' THEN 'adjective' WHEN 'bw' THEN 'adverb'
 WHEN 'vnw' THEN 'pronoun' WHEN 'vz' THEN 'preposition' WHEN 'vw' THEN 'conjunction' WHEN 'tw' THEN 'numeral'
 WHEN 'lidw' THEN 'article' WHEN 'tsw' THEN 'interjection' WHEN 'afk' THEN 'abbreviation' WHEN 'vv' THEN 'prefix'
 ELSE lower(btrim(COALESCE(p_part,''))) END part)
 SELECT (COALESCE(p_selection->'parts','[]'::jsonb)='[]'::jsonb OR (p_selection->'parts')?part)
 AND (p_selection->>'article' IS NULL OR part<>'noun' OR p_selection->>'article'=ANY(regexp_split_to_array(lower(btrim(COALESCE(p_gender,''))),'\s*[/,]\s*'))) FROM normalized;
$$;

CREATE OR REPLACE FUNCTION private.training_lexical_candidate_matches_v1(p_part_of_speech text, p_gender text, p_training_filter jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
  v_requested_pos text[] := ARRAY[]::text[];
  v_requested_articles text[] := ARRAY[]::text[];
  v_entry_pos text;
  v_entry_gender text;
BEGIN
  IF v_filter#>'{vocabulary,materialKinds}'='["other"]'::jsonb THEN RETURN true; END IF;
  IF NOT (v_filter ? 'partOfSpeech' OR v_filter ? 'nounArticles') THEN
    RETURN true;
  END IF;

  IF v_filter ? 'partOfSpeech' THEN
    IF jsonb_typeof(v_filter->'partOfSpeech') <> 'array' THEN RETURN false; END IF;
    SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::text[])
      INTO v_requested_pos
    FROM jsonb_array_elements_text(v_filter->'partOfSpeech') AS item(value);
    IF EXISTS (
      SELECT 1 FROM unnest(v_requested_pos) AS item(value)
      WHERE value IS NULL
        OR value NOT IN ('zn','ww','bn','bw','vz','vnw','vw','tw','lidw','tsw','afk','vv')
    ) THEN RETURN false; END IF;
  END IF;

  IF v_filter ? 'nounArticles' THEN
    IF jsonb_typeof(v_filter->'nounArticles') <> 'array' THEN RETURN false; END IF;
    SELECT COALESCE(array_agg(DISTINCT lower(value)), ARRAY[]::text[])
      INTO v_requested_articles
    FROM jsonb_array_elements_text(v_filter->'nounArticles') AS item(value);
    IF EXISTS (
      SELECT 1 FROM unnest(v_requested_articles) AS item(value)
      WHERE value IS NULL OR value NOT IN ('de','het')
    ) THEN RETURN false; END IF;
  END IF;

  v_entry_pos := private.normalize_training_part_of_speech_v1(p_part_of_speech);
  v_entry_gender := lower(trim(p_gender));

  IF cardinality(v_requested_pos) > 0
     AND (v_entry_pos IS NULL OR NOT (v_entry_pos = ANY(v_requested_pos))) THEN
    RETURN false;
  END IF;

  IF cardinality(v_requested_articles) > 0 THEN
    -- Articles narrow selected nouns. Explicitly selected non-noun categories
    -- remain eligible; with no POS selection, article filtering selects nouns.
    IF v_entry_pos = 'zn' THEN
      RETURN COALESCE(EXISTS(SELECT 1 FROM unnest(regexp_split_to_array(v_entry_gender, '\s*[/,]\s*')) gender WHERE gender=ANY(v_requested_articles)), false);
    END IF;
    RETURN cardinality(v_requested_pos) > 0
      AND v_entry_pos IS NOT NULL
      AND v_entry_pos = ANY(v_requested_pos);
  END IF;

  RETURN true;
END;
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
    v_cursor_group_id uuid;
    v_items jsonb;
    v_has_more boolean;
    v_next_cursor text;
    v_missing_identity_count integer;
    v_total_groups integer; v_oversized_group jsonb;
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
        WHERE p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary')
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
        UNION ALL
        SELECT document.entry_id, document.headword, document.meaning_id,
            document.dictionary_id, normalize_dictionary_search_text(document.headword) AS sort_headword,
            'exact-headword'::text AS resolved_by, document.headword AS matched_text,
            1 AS tier_rank, CASE WHEN document.normalized_headword=v_query THEN 1 ELSE 2 END AS match_rank
        FROM public.dictionary_search_documents document
        JOIN eligible_dictionaries dictionary ON dictionary.id=document.dictionary_id AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id OR document.entry_id IN (SELECT entry_id FROM shared_entries))
        JOIN private.active_word_entries filter_entry ON filter_entry.id=document.entry_id
        WHERE NOT (p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary'))
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
          AND private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection)
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
          AND private.library_entry_selection_matches_v1(entry.id,entry.part_of_speech,entry.gender,p_library_selection)
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
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN private.vocabulary_order_rank_v1(entry_id,p_library_selection->>'sort') END),min(dictionary_rank)) AS dictionary_rank,
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND (
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND (
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
        WHERE private.library_entry_selection_matches_v1(entry.id,entry.part_of_speech,entry.gender,p_library_selection) AND NOT p_catalog
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
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
        WHERE private.library_entry_selection_matches_v1(entry.id,entry.part_of_speech,entry.gender,p_library_selection) AND NOT p_catalog
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
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN private.vocabulary_order_rank_v1(entry_id,p_library_selection->>'sort') END),min(dictionary_rank)) AS dictionary_rank,
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
        WHERE p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary')
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
        UNION ALL
        SELECT document.entry_id, document.headword, document.meaning_id,
            document.dictionary_id, normalize_dictionary_search_text(document.headword) AS sort_headword,
            'exact-headword'::text AS resolved_by, document.headword AS matched_text,
            1 AS tier_rank, CASE WHEN document.normalized_headword=v_query THEN 1 ELSE 2 END AS match_rank
        FROM public.dictionary_search_documents document
        JOIN eligible_dictionaries dictionary ON dictionary.id=document.dictionary_id JOIN material_entries material_member ON material_member.entry_id=document.entry_id
        JOIN private.active_word_entries filter_entry ON filter_entry.id=document.entry_id
        WHERE NOT (p_library_selection->'parts'='[]'::jsonb AND p_library_selection->>'article' IS NULL AND NOT private.vocabulary_has_selection_v1(p_library_selection->'vocabulary'))
          AND (v_language_code IS NULL OR document.language_code=v_language_code)
          AND private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection)
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
          AND private.library_entry_selection_matches_v1(entry.id,entry.part_of_speech,entry.gender,p_library_selection)
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
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN private.vocabulary_order_rank_v1(entry_id,p_library_selection->>'sort') END),min(dictionary_rank)) AS dictionary_rank,
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND (
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND (
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
        WHERE private.library_entry_selection_matches_v1(entry.id,entry.part_of_speech,entry.gender,p_library_selection) AND NOT p_catalog
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
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
        WHERE private.library_entry_selection_matches_v1(filter_entry.id,filter_entry.part_of_speech,filter_entry.gender,p_library_selection) AND NOT EXISTS (SELECT 1 FROM headword_candidates)
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
        WHERE private.library_entry_selection_matches_v1(entry.id,entry.part_of_speech,entry.gender,p_library_selection) AND NOT p_catalog
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
    candidate_groups AS MATERIALIZED (
        SELECT
            headword_group_id,
            min(tier_rank) AS tier_rank,
            min(match_rank) AS match_rank,
            COALESCE(min(CASE WHEN p_library_selection->>'sort' IN ('spoken','written') THEN private.vocabulary_order_rank_v1(entry_id,p_library_selection->>'sort') END),min(dictionary_rank)) AS dictionary_rank,
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
    SELECT w.id,w.dictionary_id,w.language_code,w.headword,w.part_of_speech,w.gender,w.raw,w.is_nt2_2000,
           CASE WHEN p_filters->>'sort'='alphabetical' THEN 0 ELSE COALESCE(private.vocabulary_order_rank_v1(w.id,p_filters->>'sort'),members.sort_rank) END sort_rank,CASE WHEN p_filters?'sort' THEN NULL::timestamptz ELSE members.added_at END added_at
    FROM members JOIN private.active_word_entries w ON w.id=members.word_id
    WHERE (w.dictionary_id IS NULL OR public.can_browse_dictionary(principal,w.dictionary_id))
      AND (p_language_code IS NULL OR w.language_code=p_language_code)
      AND (NULLIF(trim(p_query),'') IS NULL OR w.headword ILIKE '%' || trim(p_query) || '%')
      AND private.library_entry_selection_matches_v1(w.id,w.part_of_speech,w.gender,selection)
  ), page AS (
    SELECT * FROM scoped
    ORDER BY sort_rank ASC,added_at DESC NULLS LAST,headword ASC,id ASC
    OFFSET page_offset LIMIT page_limit
  )
  SELECT jsonb_build_object(
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY sort_rank ASC,added_at DESC NULLS LAST,headword ASC,id ASC) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM scoped),
    'is_locked',maximum IS NOT NULL AND page_offset>=maximum,
    'max_allowed',maximum
  ) INTO payload;
  RETURN payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_platform_v2_library_filtered_entries(p_user_id uuid, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  preferences jsonb;
  allowed_codes jsonb;
  selection jsonb;
  dictionary_ids jsonb;
  payload jsonb;
  parts jsonb;
  article text;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF cardinality(p_dictionary_ids)>100 OR array_position(p_dictionary_ids,NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_dictionary_scope');
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) key WHERE key NOT IN ('parts','article','vocabulary','sort')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  IF NOT private.valid_vocabulary_selection_v1(p_filters->'vocabulary') OR (p_filters ? 'sort' AND (jsonb_typeof(p_filters->'sort')<>'string' OR p_filters->>'sort' NOT IN ('alphabetical','spoken','written'))) THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts)<>'array' THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  IF jsonb_array_length(parts)>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')) THEN
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
    'dictionaryIds',dictionary_ids,'parts',parts,'article',article,'vocabulary',p_filters->'vocabulary','sort',p_filters->>'sort');
  payload := private.lookup_platform_v2_library_filtered_entries_base_v1(
    p_user_id,false,p_query,p_language_code,p_cursor,p_group_limit,p_group_entry_bound,selection);
  RETURN private.attach_platform_v2_presentation_identity_v1(payload,p_user_id,false);
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_platform_v2_library_material_entries(p_user_id uuid, p_query text, p_language_code text DEFAULT NULL::text, p_dictionary_ids uuid[] DEFAULT NULL::uuid[], p_cursor text DEFAULT NULL::text, p_group_limit integer DEFAULT 10, p_group_entry_bound integer DEFAULT 50, p_filters jsonb DEFAULT '{}'::jsonb, p_material jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $_$
DECLARE
  preferences jsonb;
  allowed_codes jsonb;
  selection jsonb;
  dictionary_ids jsonb;
  payload jsonb;
  parts jsonb;
  article text;
BEGIN

  IF p_material IS NULL OR jsonb_typeof(p_material)<>'object' THEN
    RETURN jsonb_build_object('error','invalid_material_scope');
  END IF;
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
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('error','invalid_principal'); END IF;
  IF cardinality(p_dictionary_ids)>100 OR array_position(p_dictionary_ids,NULL) IS NOT NULL THEN
    RETURN jsonb_build_object('error','invalid_dictionary_scope');
  END IF;
  IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) key WHERE key NOT IN ('parts','article','vocabulary','sort')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  IF NOT private.valid_vocabulary_selection_v1(p_filters->'vocabulary') OR (p_filters ? 'sort' AND (jsonb_typeof(p_filters->'sort')<>'string' OR p_filters->>'sort' NOT IN ('alphabetical','spoken','written'))) THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts)<>'array' THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  IF jsonb_array_length(parts)>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')) THEN
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
    'dictionaryIds',dictionary_ids,'parts',parts,'article',article,'vocabulary',p_filters->'vocabulary','sort',p_filters->>'sort','material',p_material);

  -- Bind cursors to the exact live membership set; additions/removals cannot silently skip pages.
  selection := selection || jsonb_build_object('materialRevision', (
    SELECT md5(COALESCE(string_agg(entry_id::text,',' ORDER BY entry_id),''))
    FROM private.library_material_entry_ids_v1(p_user_id,p_material)
  ));
  payload := private.lookup_platform_v2_library_material_filtered_entries_base_v1(
    p_user_id,false,p_query,p_language_code,p_cursor,p_group_limit,p_group_entry_bound,selection);

  IF NOT (payload ? 'error') THEN
    payload := jsonb_set(payload,'{page,unavailableEntryCount}', to_jsonb((
      SELECT count(*)::integer FROM private.library_material_entry_ids_v1(p_user_id,p_material) member
      JOIN public.word_entries entry ON entry.id=member.entry_id
      WHERE (p_language_code IS NULL OR entry.language_code=p_language_code)
        AND entry.id NOT IN (SELECT entry_id FROM private.readable_material_entry_ids_v1(p_user_id,p_material))
    )),true);
  END IF;
  RETURN private.attach_platform_v2_presentation_identity_v1(payload,p_user_id,false);
END;
$_$;

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
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) key WHERE key NOT IN ('parts','article','vocabulary','sort')) THEN
    RETURN jsonb_build_object('error','invalid_library_filters');
  END IF;
  IF NOT private.valid_vocabulary_selection_v1(p_filters->'vocabulary') OR (p_filters ? 'sort' AND (jsonb_typeof(p_filters->'sort')<>'string' OR p_filters->>'sort' NOT IN ('alphabetical','spoken','written'))) THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  parts := COALESCE(p_filters->'parts','[]'::jsonb);
  IF jsonb_typeof(parts)<>'array' THEN RETURN jsonb_build_object('error','invalid_library_filters'); END IF;
  IF jsonb_array_length(parts)>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(parts) item
    WHERE jsonb_typeof(item)<>'string' OR item #>> '{}' NOT IN
      ('noun','verb','adjective','adverb','pronoun','preposition','conjunction','numeral','article','interjection','abbreviation','prefix')) THEN
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
    'dictionaryIds',dictionary_ids,'parts',parts,'article',article,'vocabulary',p_filters->'vocabulary','sort',p_filters->>'sort') || CASE WHEN p_material IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('material',p_material) END;

  -- Bind cursors to the exact live membership set; additions/removals cannot silently skip pages.
  IF p_material IS NOT NULL THEN
  selection := selection || jsonb_build_object('materialRevision', (
    SELECT md5(COALESCE(string_agg(entry_id::text,',' ORDER BY entry_id),''))
    FROM private.library_material_entry_ids_v1(p_user_id,p_material)
  ));
  END IF;

  scope_key := md5(jsonb_build_array('library-category-v1',p_user_id,btrim(p_query),p_language_code,p_group,selection,private.vocabulary_frequency_revision_v1())::text);
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
    AND private.library_entry_selection_matches_v1(e.id,e.part_of_speech,e.gender,p_selection)
    AND (NOT (p_selection ? 'material') OR e.id IN (SELECT entry_id FROM material));
$$;

-- Count existing article identities without loading each article presentation.
CREATE FUNCTION private.library_entry_group_id_v1(p_entry_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT g.id FROM private.platform_v2_headword_groups g WHERE g.management_kind='user' AND g.singleton_entry_id=p_entry_id
 UNION ALL SELECT g.id FROM private.source_entry_bindings b JOIN private.platform_v2_headword_groups g ON g.management_kind='source' AND g.dictionary_id=b.dictionary_id AND g.identity_scheme_version=b.identity_scheme_version AND g.source_group_key=b.source_group_key WHERE b.word_entry_id=p_entry_id AND b.binding_state='active' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.library_entry_group_id_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

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
    page_rows AS (
        SELECT *
        FROM deduped
        WHERE (v_cursor = '{}'::jsonb)
           OR (rank, COALESCE(private.vocabulary_order_rank_v1(entry_id,p_library_selection->>'sort'),0), normalized_headword, meaning_id, entry_id) >
              (
                COALESCE((v_cursor->>'rank')::int, -1),
                COALESCE(private.vocabulary_order_rank_v1((v_cursor->>'entryId')::uuid,p_library_selection->>'sort'),0),
                COALESCE(v_cursor->>'headwordSort', ''),
                COALESCE((v_cursor->>'meaningId')::int, -1),
                COALESCE((v_cursor->>'entryId')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              )
        ORDER BY rank, COALESCE(private.vocabulary_order_rank_v1(entry_id,p_library_selection->>'sort'),0), normalized_headword, meaning_id, entry_id
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
    v_group_total integer := 0;
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
                'match', jsonb_build_object(
                    'relation', 'alphabetical',
                    'matchedText', headword,
                    'sourcePath', 'dictionary_search_documents.normalized_headword_unaccent'
                )
            ) END AS payload,
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
        COUNT(DISTINCT private.library_entry_group_id_v1((cursor_payload->>'entryId')::uuid))::integer,
        EXISTS(SELECT 1 FROM visible_page WHERE rn > v_limit),
        (array_agg(cursor_payload ORDER BY rn DESC))[1]
    INTO v_items, v_group_total, v_has_more, v_last
    FROM payloads;

    IF v_has_more AND v_last IS NOT NULL THEN
        v_next_cursor := private.encode_dictionary_search_cursor_v1(v_last);
    END IF;

    RETURN jsonb_build_object(
        'id', 'alphabetical',
        'total', NULL,
        'count', jsonb_build_object('value', NULL, 'relation', 'unknown'),
        'wordGroupCount',COALESCE(v_group_total,0),'items', COALESCE(v_items, '[]'::jsonb),
        'page', jsonb_build_object(
            'limit', v_limit,
            'nextCursor', v_next_cursor,
            'hasMore', COALESCE(v_has_more, false)
        )
    );
END;
$$;

CREATE FUNCTION private.valid_training_library_selection_v1(p_value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_value IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(p_value)<>'object' OR NOT(p_value ?& ARRAY['query','category'])
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) key WHERE key NOT IN ('query','category','labelId','labelName','languageCode'))
 OR jsonb_typeof(p_value->'query')<>'string' OR length(p_value->>'query')>200
 OR jsonb_typeof(p_value->'category')<>'string' OR p_value->>'category' NOT IN ('headwords','examples','definitions','alphabetical')
 OR (p_value?'languageCode' AND (jsonb_typeof(p_value->'languageCode')<>'string' OR length(p_value->>'languageCode')>35 OR p_value->>'languageCode'!~'^[a-z]{2,3}(-[a-z0-9]{2,8})*$'))
 OR (p_value?'labelId' AND (jsonb_typeof(p_value->'labelId')<>'string' OR p_value->>'labelId'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
 OR (p_value?'labelName' AND (jsonb_typeof(p_value->'labelName')<>'string' OR length(p_value->>'labelName')>200)) THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.valid_training_library_selection_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Source-word status is separate from the new/review state of an exercise card.
-- Missing fields preserve the eligibility of legacy owned runs.
CREATE OR REPLACE FUNCTION private.valid_source_word_status_v1(p_filter jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog' AS $$
 SELECT NOT (p_filter ? 'sourceWordStatus') OR p_filter->'sourceWordStatus' IN ('"learning"'::jsonb,'"all"'::jsonb);
$$;
CREATE OR REPLACE FUNCTION private.training_source_word_selected_v1(p_user uuid,p_entry uuid,p_status text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','pg_temp' AS $$
 SELECT p_status='all' OR (p_status='learning' AND EXISTS(
  SELECT 1 FROM public.user_card_status s
  WHERE s.user_id=p_user AND s.entry_id=p_entry
   AND s.card_type_id IN ('word-to-definition','definition-to-word')
   AND (COALESCE(s.in_learning,false) OR COALESCE(s.fsrs_enabled,false))
   AND NOT EXISTS(SELECT 1 FROM public.user_card_known_marks k
    WHERE k.user_id=s.user_id AND k.entry_id=s.entry_id
     AND k.card_type_id IN ('word-to-definition','definition-to-word') AND k.cleared_at IS NULL)
 ));
$$;
CREATE OR REPLACE FUNCTION private.training_word_context_candidate_v1(p_user_id uuid,p_entry_id uuid,p_card_type_id text,p_filter jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private','pg_temp' AS $$
 SELECT CASE WHEN p_filter ? 'sourceWordStatus' THEN
  p_card_type_id='definition-to-word'
  AND private.training_source_word_selected_v1(p_user_id,p_entry_id,p_filter->>'sourceWordStatus')
  AND EXISTS(SELECT 1 FROM private.platform_v2_content_nodes example WHERE example.entry_id=p_entry_id
   AND example.kind='example' AND example.binding_state='active'
   AND NULLIF(btrim(example.diagnostic_locator),'') IS NOT NULL
   AND example.diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$')
 ELSE private.training_word_context_candidate_v1(p_user_id,p_entry_id,p_card_type_id) END;
$$;
REVOKE ALL ON FUNCTION private.valid_source_word_status_v1(jsonb),
 private.training_source_word_selected_v1(uuid,uuid,text),
 private.training_word_context_candidate_v1(uuid,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.resolve_training_material_selection_v1(p_user_id uuid, p_list_id uuid, p_list_type text, p_filter jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_preferences jsonb;
  v_language text;
  v_allowed jsonb;
  v_filter jsonb := COALESCE(p_filter, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL OR p_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF jsonb_typeof(v_filter) <> 'object' THEN RAISE EXCEPTION 'invalid_training_filter'; END IF;
  IF NOT private.valid_source_word_status_v1(v_filter) OR NOT private.valid_vocabulary_selection_v1(v_filter->'vocabulary') OR NOT private.valid_training_library_selection_v1(v_filter->'librarySelection') THEN RAISE EXCEPTION 'invalid_training_filter'; END IF;
  SELECT settings.material_preferences, settings.language_code
    INTO v_preferences, v_language FROM public.user_settings settings
    WHERE settings.user_id = p_user_id;
  v_preferences := COALESCE(v_preferences,
    '{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb);
  v_language := COALESCE(v_language, 'nl');
  IF v_filter ? 'dictionaryScope' THEN
    v_language := v_filter#>>'{dictionaryScope,languageCode}';
  ELSIF p_list_id IS NOT NULL THEN
    IF p_list_type = 'user' THEN
      SELECT COALESCE(list.primary_language_code,list.language_code,v_language)
        INTO v_language FROM public.user_word_lists list
        WHERE list.id=p_list_id AND (list.user_id=p_user_id
    OR list.id IN (SELECT collection_id FROM private.shared_collection_ids_v1(p_user_id)));
    ELSE
      SELECT COALESCE(list.primary_language_code,list.language_code,v_language)
        INTO v_language FROM public.word_lists list WHERE list.id=p_list_id;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
  END IF;
  IF v_filter#>>'{librarySelection,languageCode}' IS NOT NULL THEN
    IF v_filter?'dictionaryScope' AND v_filter#>>'{dictionaryScope,languageCode}' IS DISTINCT FROM v_filter#>>'{librarySelection,languageCode}' THEN RAISE EXCEPTION 'invalid_training_filter'; END IF;
    v_language:=v_filter#>>'{librarySelection,languageCode}';
  END IF;
  IF jsonb_array_length(v_preferences->'learningLanguages') = 0 THEN
    v_allowed := 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(item->>'code'), '[]'::jsonb) INTO v_allowed
      FROM jsonb_array_elements(v_preferences->'learningLanguages') item
      WHERE item->'paused' = 'false'::jsonb;
    IF NOT (v_allowed ? v_language) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
  END IF;
  -- Caller-supplied snapshots are never authoritative for a new run or plan.
  v_filter := (v_filter - 'materialSelection') || jsonb_build_object('materialSelection',
    jsonb_build_object('schemaVersion',1,'allowedLanguageCodes',v_allowed,
      'disabledDictionaryIds',v_preferences->'disabledDictionaryIds'));
  IF v_filter ? 'dictionaryScope' AND NOT EXISTS (
    SELECT 1 FROM public.dictionaries dictionary
    WHERE dictionary.language_code=v_language
      AND (public.can_access_dictionary(p_user_id,dictionary.id,'read') OR (
    dictionary.kind='user' AND EXISTS (SELECT 1 FROM private.shared_author_entry_memberships_v1 shared
      JOIN private.active_word_entries shared_entry ON shared_entry.id=shared.entry_id
      WHERE shared.user_id=p_user_id AND shared_entry.dictionary_id=dictionary.id)))
      AND private.training_material_entry_selected_v1(dictionary.language_code,dictionary.id,v_filter)
      AND (v_filter#>>'{dictionaryScope,mode}' = 'all' OR
        (v_filter#>'{dictionaryScope,dictionaryIds}') ? dictionary.id::text)
  ) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
  RETURN v_filter;
END;
$$;

-- Resolve the same Library criteria in one set operation before candidate learning state.
-- No caller-supplied result IDs, inferred links or stored result snapshots.
CREATE FUNCTION private.training_library_selection_entry_ids_v1(p_user uuid,p_list_id uuid,p_list_type text,p_filter jsonb) RETURNS TABLE(entry_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE
 choice jsonb:=p_filter->'librarySelection'; material jsonb; filters jsonb; payload jsonb; group_page jsonb;
 language text; dictionaries uuid[]; selection jsonb;
BEGIN
 IF choice IS NULL THEN RETURN; END IF;
 p_filter:=private.resolve_training_material_selection_v1(p_user,p_list_id,p_list_type,p_filter);
 IF NOT private.valid_training_library_selection_v1(choice) THEN RAISE EXCEPTION 'invalid_training_filter'; END IF;
 IF choice?'labelId' THEN material:=jsonb_build_object('kind','label','id',choice->>'labelId');
 ELSIF p_list_id IS NOT NULL THEN material:=jsonb_build_object('kind','collection','id',p_list_id,'collectionType',COALESCE(p_list_type,'curated')); END IF;
 IF NULLIF(btrim(choice->>'query'),'') IS NULL THEN
  IF material IS NOT NULL THEN RETURN QUERY SELECT selected.entry_id FROM private.readable_material_entry_ids_v1(p_user,material) selected JOIN private.active_word_entries e ON e.id=selected.entry_id WHERE choice->>'languageCode' IS NULL OR e.language_code=choice->>'languageCode';
  ELSE RETURN QUERY SELECT e.id FROM private.active_word_entries e WHERE choice->>'languageCode' IS NULL OR e.language_code=choice->>'languageCode'; END IF;
  RETURN;
 END IF;
 IF NOT private.dictionary_search_index_ready_v1() THEN RAISE EXCEPTION 'training_library_selection_unavailable: search_index_not_ready'; END IF;
 language:=COALESCE(choice->>'languageCode',p_filter#>>'{dictionaryScope,languageCode}');
 IF language IS NULL THEN
  IF p_list_id IS NOT NULL AND p_list_type='user' THEN SELECT COALESCE(primary_language_code,language_code) INTO language FROM public.user_word_lists WHERE id=p_list_id;
  ELSIF p_list_id IS NOT NULL THEN SELECT COALESCE(primary_language_code,language_code) INTO language FROM public.word_lists WHERE id=p_list_id; END IF;
  IF language IS NULL THEN SELECT language_code INTO language FROM public.user_settings WHERE user_id=p_user; END IF;
 END IF;
 IF material IS NULL AND p_filter#>>'{dictionaryScope,mode}'='selected' THEN
  SELECT array_agg(id::uuid) INTO dictionaries FROM jsonb_array_elements_text(p_filter#>'{dictionaryScope,dictionaryIds}') id;
 END IF;
 SELECT jsonb_build_object('parts',COALESCE(jsonb_agg(CASE code
 WHEN 'zn' THEN 'noun' WHEN 'ww' THEN 'verb' WHEN 'bn' THEN 'adjective' WHEN 'bw' THEN 'adverb'
 WHEN 'vnw' THEN 'pronoun' WHEN 'vz' THEN 'preposition' WHEN 'vw' THEN 'conjunction' WHEN 'tw' THEN 'numeral'
 WHEN 'lidw' THEN 'article' WHEN 'tsw' THEN 'interjection' WHEN 'afk' THEN 'abbreviation' WHEN 'vv' THEN 'prefix' END),'[]'::jsonb)) INTO filters
 FROM jsonb_array_elements_text(COALESCE(p_filter->'partOfSpeech','[]'::jsonb)) code;
 IF jsonb_array_length(COALESCE(p_filter->'nounArticles','[]'::jsonb))=1 THEN
  filters:=filters||jsonb_build_object('article',p_filter#>>'{nounArticles,0}');
  IF NOT(filters->'parts'?'noun') THEN filters:=jsonb_set(filters,'{parts}',(filters->'parts')||'["noun"]'::jsonb); END IF;
 END IF;
 IF p_filter?'vocabulary' THEN filters:=filters||jsonb_build_object('vocabulary',p_filter->'vocabulary'); END IF;
 selection:=filters||jsonb_build_object('trainingUnpaged',true,'dictionaryIds',COALESCE(to_jsonb(dictionaries),'null'::jsonb),
  'materialSelection',p_filter->'materialSelection')||CASE WHEN material IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('material',material) END;
 IF choice->>'category'='headwords' THEN
  group_page:=private.search_library_headwords_v1(p_user,false,choice->>'query',language,dictionaries,100,NULL,selection);
 ELSIF choice->>'category'='alphabetical' THEN
  group_page:=private.search_library_alphabetical_v1(p_user,false,choice->>'query',language,dictionaries,31,NULL,selection);
 ELSE
  group_page:=private.search_library_body_v1(p_user,false,choice->>'query',language,dictionaries,choice->>'category',100,NULL,selection);
 END IF;
 IF (choice->>'category'<>'alphabetical' AND COALESCE((group_page#>>'{page,hasMore}')::boolean,false)) OR jsonb_array_length(group_page->'items')>100000 THEN RAISE EXCEPTION 'training_library_selection_too_large'; END IF;
 RETURN QUERY SELECT DISTINCT (item#>>'{entry,id}')::uuid FROM jsonb_array_elements(group_page->'items') item;
END;
$$;
REVOKE ALL ON FUNCTION private.training_library_selection_entry_ids_v1(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.training_recipe_eligible_cards_v1(p_user_id uuid, p_card_type_ids text[], p_list_id uuid, p_list_type text, p_card_filter text, p_queue_turn text, p_exclude_entry_ids uuid[], p_exclude_card_keys text[], p_training_filter jsonb, p_filtered boolean, p_enforce_daily_limits boolean) RETURNS TABLE(entry_id uuid, card_type_id text, fsrs_enabled boolean, introduced boolean, next_review_at timestamp with time zone, intrinsic_source text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    SET enable_nestloop TO 'off'
    SET jit TO 'off'
    AS $_$

WITH library_selection AS MATERIALIZED (SELECT entry_id FROM private.training_library_selection_entry_ids_v1(p_user_id,p_list_id,p_list_type,p_training_filter) WHERE p_training_filter?'librarySelection'), shared_entries AS MATERIALIZED (
      SELECT entry_id FROM private.shared_author_entry_ids_v1(p_user_id)
    ), shared_dictionaries AS MATERIALIZED (
      SELECT DISTINCT entry.dictionary_id FROM shared_entries shared
      JOIN private.active_word_entries entry ON entry.id=shared.entry_id
    ), args AS (
  SELECT CASE
      WHEN p_card_type_ids IS NULL OR cardinality(p_card_type_ids)=0
        THEN ARRAY['word-to-definition']::text[]
      ELSE ARRAY(
        SELECT DISTINCT trim(mode)
        FROM unnest(p_card_type_ids) requested(mode)
        WHERE trim(mode)<>'' ORDER BY 1
      )
    END modes,
    COALESCE(p_training_filter,'{}') filter_data,
    COALESCE(p_list_type,'curated') list_type,
    COALESCE(p_exclude_entry_ids,ARRAY[]::uuid[]) excluded_entries,
    COALESCE(p_exclude_card_keys,ARRAY[]::text[]) excluded_cards
), reference_now AS MATERIALIZED (
  SELECT private.training_reference_now_v1() AS now_at
), filter_values AS (
  SELECT args.*,
    private.training_filter_target_date(filter_data) target_date,
    private.training_schedule_timezone_v1(
      COALESCE(
        NULLIF(trim(filter_data->>'timezone'),''),
        private.training_user_timezone_v1(p_user_id)
      )
    ) timezone,
    reference_now.now_at,
    bounds.start_at study_day_start,
    bounds.end_at study_day_end,
    CASE WHEN NULLIF(filter_data->>'sourceId','') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (filter_data->>'sourceId')::uuid END source_id,
    NULLIF(trim(filter_data->>'sourceKind'),'') source_kind,
    NULLIF(trim(filter_data->>'externalId'),'') external_id,
    NULLIF(trim(filter_data#>>'{dictionaryScope,mode}'),'') dictionary_mode,
    NULLIF(trim(filter_data#>>'{dictionaryScope,languageCode}'),'') dictionary_language
  FROM args
  CROSS JOIN reference_now
  CROSS JOIN LATERAL private.training_study_day_bounds_v1(
    reference_now.now_at,
    private.training_schedule_timezone_v1(
      COALESCE(
        NULLIF(trim(args.filter_data->>'timezone'),''),
        private.training_user_timezone_v1(p_user_id)
      )
    )
  ) bounds
), mode_order AS (
  SELECT requested_mode.card_type_id,random() mode_random
  FROM filter_values
  CROSS JOIN unnest(filter_values.modes) requested_mode(card_type_id)
), cohort_context AS (
  SELECT md5(concat_ws('|',
    p_user_id::text,
    array_to_string(filter_values.modes,','),
    COALESCE(p_list_id::text,''),
    filter_values.list_type,
    p_card_filter,
    filter_values.filter_data::text
  )) cohort_seed
  FROM filter_values
), limits AS (
  SELECT COALESCE(settings.daily_new_limit,10)::bigint new_limit,
    COALESCE(settings.daily_review_limit,200)::bigint review_limit
  FROM (SELECT 1) seed
  LEFT JOIN user_settings settings ON settings.user_id=p_user_id
), daily AS (
  SELECT count(DISTINCT log.word_id) FILTER (WHERE log.review_type='new') new_today,
    count(*) FILTER (WHERE log.review_type='review') review_today
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), readable_dictionaries AS MATERIALIZED (
  SELECT dictionary.id,dictionary.language_code
  FROM dictionaries dictionary
  WHERE (
      (can_access_dictionary(p_user_id,dictionary.id,'read') AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id))
      OR (dictionary.kind='user' AND dictionary.id IN (SELECT dictionary_id FROM shared_dictionaries)))
), selected_dictionaries AS MATERIALIZED (
  SELECT DISTINCT requested.id::uuid AS id
  FROM filter_values
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(filter_values.filter_data#>'{dictionaryScope,dictionaryIds}')='array'
      THEN filter_values.filter_data#>'{dictionaryScope,dictionaryIds}'
      ELSE '[]'::jsonb END
  ) requested(id)
  WHERE requested.id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
), raw_scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  WHERE p_list_id IS NULL
    AND filter_values.dictionary_mode IS NULL
    AND NOT (filter_values.filter_data ? 'partOfSpeech'
      OR filter_values.filter_data ? 'nounArticles')
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
  UNION ALL
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  JOIN private.active_word_entries lexical_entry ON lexical_entry.id=scope_entry.entry_id
  WHERE p_list_id IS NULL
    AND filter_values.dictionary_mode IS NULL
    AND (filter_values.filter_data ? 'partOfSpeech'
      OR filter_values.filter_data ? 'nounArticles')
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND private.training_lexical_candidate_matches_v1(
      lexical_entry.part_of_speech, lexical_entry.gender,
      filter_values.filter_data
    )
  UNION ALL
  SELECT entry.id
  FROM private.active_word_entries entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
  WHERE p_list_id IS NOT NULL
    AND filter_values.dictionary_mode IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM private.active_word_entries pointer_entry
      WHERE pointer_entry.id=entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND ((filter_values.list_type='curated' AND EXISTS (
        SELECT 1 FROM word_list_items item
        WHERE item.list_id=p_list_id AND item.word_id=entry.id
      ))
      OR (filter_values.list_type='user' AND EXISTS (
        SELECT 1 FROM user_word_list_items item
        JOIN user_word_lists list ON list.id=item.list_id
        WHERE item.list_id=p_list_id AND item.word_id=entry.id AND (list.user_id=p_user_id
      OR list.id IN (SELECT collection_id FROM private.shared_collection_ids_v1(p_user_id)))
      )))
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        entry.part_of_speech, entry.gender, filter_values.filter_data
      )
      ELSE true
    END
  UNION ALL
  SELECT entry.id
  FROM private.active_word_entries entry
  CROSS JOIN filter_values
  JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
   AND readable_dictionary.language_code=filter_values.dictionary_language
  WHERE p_list_id IS NULL
    AND filter_values.dictionary_mode IN ('all','selected')
    AND entry.language_code=filter_values.dictionary_language
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (filter_values.dictionary_mode='all' OR EXISTS (
      SELECT 1 FROM selected_dictionaries selected
      WHERE selected.id=entry.dictionary_id
    ))
    AND NOT EXISTS (
      SELECT 1 FROM private.active_word_entries pointer_entry
      WHERE pointer_entry.id=entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        entry.part_of_speech, entry.gender, filter_values.filter_data
      )
      ELSE true
    END
), scope AS MATERIALIZED (
    SELECT raw_scope.id FROM raw_scope
    JOIN private.active_word_entries material_entry ON material_entry.id=raw_scope.id
    LEFT JOIN public.dictionaries authority_dictionary ON authority_dictionary.id=material_entry.dictionary_id
    CROSS JOIN filter_values material_filter
    WHERE (material_entry.dictionary_id IS NULL OR authority_dictionary.kind<>'user'
      OR authority_dictionary.owner_user_id=p_user_id OR material_entry.id IN (SELECT entry_id FROM shared_entries))
      AND private.training_material_entry_selected_v1(
      material_entry.language_code,material_entry.dictionary_id,material_filter.filter_data)
      AND private.vocabulary_entry_selected_v1(material_entry.id,material_filter.filter_data->'vocabulary')
      AND (NOT(material_filter.filter_data?'librarySelection') OR material_entry.id IN (SELECT entry_id FROM library_selection))
  ), matched AS (
  SELECT event.entry_id,event.card_type_id,max(event.created_at) latest_event_at
  FROM user_card_action_events event
  LEFT JOIN learning_sources source ON source.id=event.source_id
  CROSS JOIN filter_values
  WHERE event.user_id=p_user_id
    AND event.card_type_id=ANY(filter_values.modes)
    AND (filter_values.target_date IS NULL OR
      private.training_filter_local_date(event.created_at,filter_values.timezone)=filter_values.target_date)
    AND (filter_values.source_id IS NULL OR event.source_id=filter_values.source_id)
    AND (filter_values.source_kind IS NULL OR source.kind=filter_values.source_kind
      OR source.provider=filter_values.source_kind
      OR (filter_values.source_kind='youtube' AND
        (source.kind IN ('youtube','youtube_video') OR source.provider='youtube')))
    AND (filter_values.external_id IS NULL OR source.external_id=filter_values.external_id)
  GROUP BY event.entry_id,event.card_type_id
), study_day_new_words AS MATERIALIZED (
  SELECT DISTINCT log.word_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), study_day_new_cards AS MATERIALIZED (
  SELECT DISTINCT log.word_id,log.mode AS card_type_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), known_cards AS MATERIALIZED (
  SELECT known.entry_id,known.card_type_id
  FROM user_card_known_marks known,filter_values
  WHERE known.user_id=p_user_id
    AND known.card_type_id=ANY(filter_values.modes)
    AND known.cleared_at IS NULL
), learner_status AS MATERIALIZED (
  SELECT status.*
  FROM user_card_status status,filter_values
  WHERE status.user_id=p_user_id
    AND status.card_type_id=ANY(filter_values.modes)
), unrenderable_direct_entries AS MATERIALIZED (
  SELECT entry_id FROM private.unrenderable_ordinary_direct_entries_v1
), active_source_bindings AS MATERIALIZED (
  SELECT binding.dictionary_id, binding.identity_scheme_version,
    binding.source_group_key, binding.sense_ordinal, binding.word_entry_id
  FROM private.source_entry_bindings binding
  WHERE binding.binding_state = 'active'
), source_bound_entries AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id
  FROM active_source_bindings binding
), scoped_source_groups AS NOT MATERIALIZED (
  SELECT DISTINCT binding.dictionary_id, binding.identity_scheme_version,
    binding.source_group_key
  FROM active_source_bindings binding
  JOIN scope ON scope.id = binding.word_entry_id
), active_source_definitions AS MATERIALIZED (
  SELECT definition.entry_id
  FROM private.platform_v2_content_nodes definition
  WHERE definition.binding_state = 'active'
    AND definition.parent_content_node_id IS NULL
    AND definition.kind = 'definition'
), ordinary_source_introductions AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id,
    lag(binding.word_entry_id) OVER (
      PARTITION BY binding.dictionary_id, binding.identity_scheme_version,
        binding.source_group_key
      ORDER BY binding.sense_ordinal, binding.word_entry_id
    ) AS predecessor_entry_id
  FROM active_source_bindings binding
  JOIN scoped_source_groups source_group
    USING (dictionary_id, identity_scheme_version, source_group_key)
  JOIN active_source_definitions definition
    ON definition.entry_id = binding.word_entry_id
  -- Active bindings and exception entry IDs are non-null by schema. Hashing
  -- this small exception set avoids one index probe per scoped meaning.
  WHERE binding.word_entry_id NOT IN (
    SELECT unrenderable.entry_id FROM unrenderable_direct_entries unrenderable
  )
), cards AS (
  SELECT scope.id entry_id,mode_order.card_type_id,status.fsrs_enabled,
    status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    (COALESCE(status.fsrs_reps,0)>0 OR status.last_reviewed_at IS NOT NULL) introduced,
    status.entry_id IS NOT NULL has_status,matched.entry_id IS NOT NULL matches_filter,
    matched.latest_event_at,mode_order.mode_random,
    filter_values.now_at reference_now,
    study_day_new_words.word_id IS NOT NULL new_seen_today,
    study_day_new_cards.word_id IS NOT NULL new_card_seen_today,
    CASE
      WHEN private.training_review_early_v1(p_training_filter,p_card_filter)
        AND status.fsrs_enabled=true THEN
          CASE WHEN COALESCE(status.fsrs_last_interval,0)<1 THEN 'learning' ELSE 'review' END
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1
        AND status.next_review_at<=filter_values.now_at THEN 'learning'
      WHEN status.fsrs_enabled=true AND status.fsrs_last_interval>=1
        AND status.next_review_at<=filter_values.now_at THEN 'review'
      WHEN status.entry_id IS NULL OR COALESCE(status.fsrs_enabled,false)=false THEN 'new'
      ELSE 'practice'
    END intrinsic_source
  FROM scope
  CROSS JOIN filter_values CROSS JOIN mode_order
  LEFT JOIN learner_status status ON status.entry_id=scope.id
    AND status.card_type_id=mode_order.card_type_id
  LEFT JOIN matched ON matched.entry_id=scope.id AND matched.card_type_id=mode_order.card_type_id
  LEFT JOIN study_day_new_words ON study_day_new_words.word_id=scope.id
  LEFT JOIN study_day_new_cards ON study_day_new_cards.word_id=scope.id
    AND study_day_new_cards.card_type_id=mode_order.card_type_id
  LEFT JOIN known_cards ON known_cards.entry_id=scope.id
    AND known_cards.card_type_id=mode_order.card_type_id
  WHERE NOT ((scope.id::text||':'||mode_order.card_type_id)=ANY(filter_values.excluded_cards))
    AND known_cards.entry_id IS NULL
    AND (mode_order.card_type_id NOT IN ('word-to-definition','definition-to-word') OR NOT EXISTS (
      SELECT 1 FROM private.training_headword_exclusions exclusion
      WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
        AND exclusion.entry_id=scope.id))
    AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
      WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
        AND exclusion.pair_key=private.training_pair_key_v1(
          'meaning', scope.id, NULL, NULL, mode_order.card_type_id))
), eligible AS (
  SELECT cards.*
  FROM cards
  LEFT JOIN unrenderable_direct_entries unrenderable
    ON unrenderable.entry_id = cards.entry_id
  LEFT JOIN source_bound_entries source_bound
    ON source_bound.entry_id = cards.entry_id
  LEFT JOIN ordinary_source_introductions introduction
    ON introduction.entry_id = cards.entry_id
  LEFT JOIN private.ordinary_meaning_introduction_unlocks_v1 predecessor_unlock
    ON predecessor_unlock.user_id = p_user_id
   AND predecessor_unlock.entry_id = introduction.predecessor_entry_id
  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=reference_now)
    AND (NOT private.training_review_early_v1(p_training_filter,p_card_filter)
      OR (cards.introduced AND cards.fsrs_enabled=true))
    AND CASE
      WHEN (SELECT filter_data->>'presentationMode' FROM filter_values)
        = 'word-in-context'
      THEN private.training_word_context_candidate_v1(
        p_user_id, cards.entry_id, cards.card_type_id, p_training_filter)
      ELSE true
    END
    AND (
      card_type_id <> 'word-to-definition'
      OR unrenderable.entry_id IS NULL
    )
    AND (
      intrinsic_source <> 'new'
      OR (
        card_type_id = 'definition-to-word'
        AND COALESCE((SELECT filter_data->>'presentationMode' FROM filter_values), '')
          = 'word-in-context'
      )
      OR (
        card_type_id = 'word-to-definition'
        AND (
          source_bound.entry_id IS NULL
          OR (
            introduction.entry_id IS NOT NULL
            AND (
              introduction.predecessor_entry_id IS NULL
              OR predecessor_unlock.available_at <= reference_now
            )
          )
        )
      )
    )
    AND CASE WHEN p_filtered THEN
      matches_filter AND has_status AND
      (p_card_filter='both' OR (p_card_filter='review' AND fsrs_enabled=true)
        OR (p_card_filter='new' AND COALESCE(fsrs_enabled,false)=false))
    ELSE NOT has_status OR fsrs_enabled=true END
)
 SELECT entry_id,card_type_id,fsrs_enabled,introduced,next_review_at,intrinsic_source FROM eligible;
 $_$;


CREATE OR REPLACE FUNCTION private.training_scheduler_candidates_v2(p_user_id uuid, p_card_type_ids text[], p_list_id uuid, p_list_type text, p_card_filter text, p_queue_turn text, p_exclude_entry_ids uuid[], p_exclude_card_keys text[], p_training_filter jsonb, p_filtered boolean, p_enforce_daily_limits boolean) RETURNS TABLE(entry_id uuid, card_type_id text, queue_source text, selection_order bigint, new_today bigint, daily_new_limit bigint, new_pool_size bigint, learning_due_count bigint, review_pool_size bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    SET enable_nestloop TO 'off'
    AS $_$
WITH library_selection AS MATERIALIZED (SELECT entry_id FROM private.training_library_selection_entry_ids_v1(p_user_id,p_list_id,p_list_type,p_training_filter) WHERE p_training_filter?'librarySelection'), shared_entries AS MATERIALIZED (
      SELECT entry_id FROM private.shared_author_entry_ids_v1(p_user_id)
    ), shared_dictionaries AS MATERIALIZED (
      SELECT DISTINCT entry.dictionary_id FROM shared_entries shared
      JOIN private.active_word_entries entry ON entry.id=shared.entry_id
    ), args AS (
  SELECT CASE
      WHEN p_card_type_ids IS NULL OR cardinality(p_card_type_ids)=0
        THEN ARRAY['word-to-definition']::text[]
      ELSE ARRAY(
        SELECT DISTINCT trim(mode)
        FROM unnest(p_card_type_ids) requested(mode)
        WHERE trim(mode)<>'' ORDER BY 1
      )
    END modes,
    COALESCE(p_training_filter,'{}') filter_data,
    COALESCE(p_list_type,'curated') list_type,
    COALESCE(p_exclude_entry_ids,ARRAY[]::uuid[]) excluded_entries,
    COALESCE(p_exclude_card_keys,ARRAY[]::text[]) excluded_cards
), reference_now AS MATERIALIZED (
  SELECT private.training_reference_now_v1() AS now_at
), filter_values AS (
  SELECT args.*,
    private.training_filter_target_date(filter_data) target_date,
    private.training_schedule_timezone_v1(
      COALESCE(
        NULLIF(trim(filter_data->>'timezone'),''),
        private.training_user_timezone_v1(p_user_id)
      )
    ) timezone,
    reference_now.now_at,
    bounds.start_at study_day_start,
    bounds.end_at study_day_end,
    CASE WHEN NULLIF(filter_data->>'sourceId','') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (filter_data->>'sourceId')::uuid END source_id,
    NULLIF(trim(filter_data->>'sourceKind'),'') source_kind,
    NULLIF(trim(filter_data->>'externalId'),'') external_id,
    NULLIF(trim(filter_data#>>'{dictionaryScope,mode}'),'') dictionary_mode,
    NULLIF(trim(filter_data#>>'{dictionaryScope,languageCode}'),'') dictionary_language
  FROM args
  CROSS JOIN reference_now
  CROSS JOIN LATERAL private.training_study_day_bounds_v1(
    reference_now.now_at,
    private.training_schedule_timezone_v1(
      COALESCE(
        NULLIF(trim(args.filter_data->>'timezone'),''),
        private.training_user_timezone_v1(p_user_id)
      )
    )
  ) bounds
), mode_order AS (
  SELECT requested_mode.card_type_id,random() mode_random
  FROM filter_values
  CROSS JOIN unnest(filter_values.modes) requested_mode(card_type_id)
), cohort_context AS (
  SELECT md5(concat_ws('|',
    p_user_id::text,
    array_to_string(filter_values.modes,','),
    COALESCE(p_list_id::text,''),
    filter_values.list_type,
    p_card_filter,
    filter_values.filter_data::text
  )) cohort_seed
  FROM filter_values
), limits AS (
  SELECT COALESCE(settings.daily_new_limit,10)::bigint new_limit,
    COALESCE(settings.daily_review_limit,200)::bigint review_limit
  FROM (SELECT 1) seed
  LEFT JOIN user_settings settings ON settings.user_id=p_user_id
), daily AS (
  SELECT count(DISTINCT log.word_id) FILTER (WHERE log.review_type='new') new_today,
    count(*) FILTER (WHERE log.review_type='review') review_today
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), readable_dictionaries AS MATERIALIZED (
  SELECT dictionary.id,dictionary.language_code
  FROM dictionaries dictionary
  WHERE (
      (can_access_dictionary(p_user_id,dictionary.id,'read') AND (dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id))
      OR (dictionary.kind='user' AND dictionary.id IN (SELECT dictionary_id FROM shared_dictionaries)))
), selected_dictionaries AS MATERIALIZED (
  SELECT DISTINCT requested.id::uuid AS id
  FROM filter_values
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(filter_values.filter_data#>'{dictionaryScope,dictionaryIds}')='array'
      THEN filter_values.filter_data#>'{dictionaryScope,dictionaryIds}'
      ELSE '[]'::jsonb END
  ) requested(id)
  WHERE requested.id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
), raw_scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  WHERE p_list_id IS NULL
    AND filter_values.dictionary_mode IS NULL
    AND NOT (filter_values.filter_data ? 'partOfSpeech'
      OR filter_values.filter_data ? 'nounArticles')
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
  UNION ALL
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  JOIN private.active_word_entries lexical_entry ON lexical_entry.id=scope_entry.entry_id
  WHERE p_list_id IS NULL
    AND filter_values.dictionary_mode IS NULL
    AND (filter_values.filter_data ? 'partOfSpeech'
      OR filter_values.filter_data ? 'nounArticles')
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND private.training_lexical_candidate_matches_v1(
      lexical_entry.part_of_speech, lexical_entry.gender,
      filter_values.filter_data
    )
  UNION ALL
  SELECT entry.id
  FROM private.active_word_entries entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
  WHERE p_list_id IS NOT NULL
    AND filter_values.dictionary_mode IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM private.active_word_entries pointer_entry
      WHERE pointer_entry.id=entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND ((filter_values.list_type='curated' AND EXISTS (
        SELECT 1 FROM word_list_items item
        WHERE item.list_id=p_list_id AND item.word_id=entry.id
      ))
      OR (filter_values.list_type='user' AND EXISTS (
        SELECT 1 FROM user_word_list_items item
        JOIN user_word_lists list ON list.id=item.list_id
        WHERE item.list_id=p_list_id AND item.word_id=entry.id AND (list.user_id=p_user_id
      OR list.id IN (SELECT collection_id FROM private.shared_collection_ids_v1(p_user_id)))
      )))
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        entry.part_of_speech, entry.gender, filter_values.filter_data
      )
      ELSE true
    END
  UNION ALL
  SELECT entry.id
  FROM private.active_word_entries entry
  CROSS JOIN filter_values
  JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
   AND readable_dictionary.language_code=filter_values.dictionary_language
  WHERE p_list_id IS NULL
    AND filter_values.dictionary_mode IN ('all','selected')
    AND entry.language_code=filter_values.dictionary_language
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (filter_values.dictionary_mode='all' OR EXISTS (
      SELECT 1 FROM selected_dictionaries selected
      WHERE selected.id=entry.dictionary_id
    ))
    AND NOT EXISTS (
      SELECT 1 FROM private.active_word_entries pointer_entry
      WHERE pointer_entry.id=entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        entry.part_of_speech, entry.gender, filter_values.filter_data
      )
      ELSE true
    END
), scope AS MATERIALIZED (
    SELECT raw_scope.id FROM raw_scope
    JOIN private.active_word_entries material_entry ON material_entry.id=raw_scope.id
    LEFT JOIN public.dictionaries authority_dictionary ON authority_dictionary.id=material_entry.dictionary_id
    CROSS JOIN filter_values material_filter
    WHERE (material_entry.dictionary_id IS NULL OR authority_dictionary.kind<>'user'
      OR authority_dictionary.owner_user_id=p_user_id OR material_entry.id IN (SELECT entry_id FROM shared_entries))
      AND private.training_material_entry_selected_v1(
      material_entry.language_code,material_entry.dictionary_id,material_filter.filter_data)
      AND private.vocabulary_entry_selected_v1(material_entry.id,material_filter.filter_data->'vocabulary')
      AND (NOT(material_filter.filter_data?'librarySelection') OR material_entry.id IN (SELECT entry_id FROM library_selection))
  ), matched AS (
  SELECT event.entry_id,event.card_type_id,max(event.created_at) latest_event_at
  FROM user_card_action_events event
  LEFT JOIN learning_sources source ON source.id=event.source_id
  CROSS JOIN filter_values
  WHERE event.user_id=p_user_id
    AND event.card_type_id=ANY(filter_values.modes)
    AND (filter_values.target_date IS NULL OR
      private.training_filter_local_date(event.created_at,filter_values.timezone)=filter_values.target_date)
    AND (filter_values.source_id IS NULL OR event.source_id=filter_values.source_id)
    AND (filter_values.source_kind IS NULL OR source.kind=filter_values.source_kind
      OR source.provider=filter_values.source_kind
      OR (filter_values.source_kind='youtube' AND
        (source.kind IN ('youtube','youtube_video') OR source.provider='youtube')))
    AND (filter_values.external_id IS NULL OR source.external_id=filter_values.external_id)
  GROUP BY event.entry_id,event.card_type_id
), study_day_new_words AS MATERIALIZED (
  SELECT DISTINCT log.word_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), study_day_new_cards AS MATERIALIZED (
  SELECT DISTINCT log.word_id,log.mode AS card_type_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), known_cards AS MATERIALIZED (
  SELECT known.entry_id,known.card_type_id
  FROM user_card_known_marks known,filter_values
  WHERE known.user_id=p_user_id
    AND known.card_type_id=ANY(filter_values.modes)
    AND known.cleared_at IS NULL
), learner_status AS MATERIALIZED (
  SELECT status.*
  FROM user_card_status status,filter_values
  WHERE status.user_id=p_user_id
    AND status.card_type_id=ANY(filter_values.modes)
), unrenderable_direct_entries AS MATERIALIZED (
  SELECT entry_id FROM private.unrenderable_ordinary_direct_entries_v1
), active_source_bindings AS MATERIALIZED (
  SELECT binding.dictionary_id, binding.identity_scheme_version,
    binding.source_group_key, binding.sense_ordinal, binding.word_entry_id
  FROM private.source_entry_bindings binding
  WHERE binding.binding_state = 'active'
), source_bound_entries AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id
  FROM active_source_bindings binding
), scoped_source_groups AS NOT MATERIALIZED (
  SELECT DISTINCT binding.dictionary_id, binding.identity_scheme_version,
    binding.source_group_key
  FROM active_source_bindings binding
  JOIN scope ON scope.id = binding.word_entry_id
), active_source_definitions AS MATERIALIZED (
  SELECT definition.entry_id
  FROM private.platform_v2_content_nodes definition
  WHERE definition.binding_state = 'active'
    AND definition.parent_content_node_id IS NULL
    AND definition.kind = 'definition'
), ordinary_source_introductions AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id,
    lag(binding.word_entry_id) OVER (
      PARTITION BY binding.dictionary_id, binding.identity_scheme_version,
        binding.source_group_key
      ORDER BY binding.sense_ordinal, binding.word_entry_id
    ) AS predecessor_entry_id
  FROM active_source_bindings binding
  JOIN scoped_source_groups source_group
    USING (dictionary_id, identity_scheme_version, source_group_key)
  JOIN active_source_definitions definition
    ON definition.entry_id = binding.word_entry_id
  -- Active bindings and exception entry IDs are non-null by schema. Hashing
  -- this small exception set avoids one index probe per scoped meaning.
  WHERE binding.word_entry_id NOT IN (
    SELECT unrenderable.entry_id FROM unrenderable_direct_entries unrenderable
  )
), cards AS (
  SELECT scope.id entry_id,mode_order.card_type_id,status.fsrs_enabled,
    status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    (COALESCE(status.fsrs_reps,0)>0 OR status.last_reviewed_at IS NOT NULL) introduced,
    status.entry_id IS NOT NULL has_status,matched.entry_id IS NOT NULL matches_filter,
    matched.latest_event_at,mode_order.mode_random,
    filter_values.now_at reference_now,
    study_day_new_words.word_id IS NOT NULL new_seen_today,
    study_day_new_cards.word_id IS NOT NULL new_card_seen_today,
    CASE
      WHEN private.training_review_early_v1(p_training_filter,p_card_filter)
        AND status.fsrs_enabled=true THEN
          CASE WHEN COALESCE(status.fsrs_last_interval,0)<1 THEN 'learning' ELSE 'review' END
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1
        AND status.next_review_at<=filter_values.now_at THEN 'learning'
      WHEN status.fsrs_enabled=true AND status.fsrs_last_interval>=1
        AND status.next_review_at<=filter_values.now_at THEN 'review'
      WHEN status.entry_id IS NULL OR COALESCE(status.fsrs_enabled,false)=false THEN 'new'
      ELSE 'practice'
    END intrinsic_source
  FROM scope
  CROSS JOIN filter_values CROSS JOIN mode_order
  LEFT JOIN learner_status status ON status.entry_id=scope.id
    AND status.card_type_id=mode_order.card_type_id
  LEFT JOIN matched ON matched.entry_id=scope.id AND matched.card_type_id=mode_order.card_type_id
  LEFT JOIN study_day_new_words ON study_day_new_words.word_id=scope.id
  LEFT JOIN study_day_new_cards ON study_day_new_cards.word_id=scope.id
    AND study_day_new_cards.card_type_id=mode_order.card_type_id
  LEFT JOIN known_cards ON known_cards.entry_id=scope.id
    AND known_cards.card_type_id=mode_order.card_type_id
  WHERE NOT ((scope.id::text||':'||mode_order.card_type_id)=ANY(filter_values.excluded_cards))
    AND known_cards.entry_id IS NULL
    AND (mode_order.card_type_id NOT IN ('word-to-definition','definition-to-word') OR NOT EXISTS (
      SELECT 1 FROM private.training_headword_exclusions exclusion
      WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
        AND exclusion.entry_id=scope.id))
    AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
      WHERE exclusion.user_id=p_user_id AND exclusion.restored_at IS NULL
        AND exclusion.pair_key=private.training_pair_key_v1(
          'meaning', scope.id, NULL, NULL, mode_order.card_type_id))
), eligible AS (
  SELECT cards.*
  FROM cards
  LEFT JOIN unrenderable_direct_entries unrenderable
    ON unrenderable.entry_id = cards.entry_id
  LEFT JOIN source_bound_entries source_bound
    ON source_bound.entry_id = cards.entry_id
  LEFT JOIN ordinary_source_introductions introduction
    ON introduction.entry_id = cards.entry_id
  LEFT JOIN private.ordinary_meaning_introduction_unlocks_v1 predecessor_unlock
    ON predecessor_unlock.user_id = p_user_id
   AND predecessor_unlock.entry_id = introduction.predecessor_entry_id
  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=reference_now)
    AND (NOT private.training_review_early_v1(p_training_filter,p_card_filter)
      OR (cards.introduced AND cards.fsrs_enabled=true))
    AND CASE
      WHEN (SELECT filter_data->>'presentationMode' FROM filter_values)
        = 'word-in-context'
      THEN private.training_word_context_candidate_v1(
        p_user_id, cards.entry_id, cards.card_type_id, p_training_filter)
      ELSE true
    END
    AND (
      card_type_id <> 'word-to-definition'
      OR unrenderable.entry_id IS NULL
    )
    AND (
      intrinsic_source <> 'new'
      OR (
        card_type_id = 'definition-to-word'
        AND COALESCE((SELECT filter_data->>'presentationMode' FROM filter_values), '')
          = 'word-in-context'
      )
      OR (
        card_type_id = 'word-to-definition'
        AND (
          source_bound.entry_id IS NULL
          OR (
            introduction.entry_id IS NOT NULL
            AND (
              introduction.predecessor_entry_id IS NULL
              OR predecessor_unlock.available_at <= reference_now
            )
          )
        )
      )
    )
    AND CASE WHEN p_filtered THEN
      matches_filter AND has_status AND
      (p_card_filter='both' OR (p_card_filter='review' AND fsrs_enabled=true)
        OR (p_card_filter='new' AND COALESCE(fsrs_enabled,false)=false))
    ELSE NOT has_status OR fsrs_enabled=true END
), new_word_ranks AS (
  SELECT unseen.entry_id,
    row_number() OVER (
      ORDER BY md5(cohort_context.cohort_seed||':'||unseen.entry_id::text)
    ) new_word_ordinal,
    count(*) OVER () new_word_count
  FROM (
    SELECT DISTINCT entry_id FROM eligible
    WHERE intrinsic_source='new' AND NOT new_seen_today
  ) unseen CROSS JOIN cohort_context
), ranked AS (
  SELECT eligible.*,
    row_number() OVER (
      PARTITION BY eligible.intrinsic_source
      ORDER BY CASE WHEN eligible.intrinsic_source IN ('review','learning') THEN eligible.next_review_at END,
        md5(eligible.entry_id::text||':'||eligible.card_type_id)
    ) source_ordinal,
    new_word_ranks.new_word_ordinal,
    COALESCE((SELECT max(new_word_count) FROM new_word_ranks),0) new_word_count,
    count(*) FILTER (WHERE intrinsic_source='review') OVER () review_count
  FROM eligible
  LEFT JOIN new_word_ranks ON new_word_ranks.entry_id=eligible.entry_id
), classified AS (
  SELECT ranked.*,
    GREATEST(0,limits.new_limit-COALESCE(daily.new_today,0)) new_remaining,
    GREATEST(0,limits.review_limit-COALESCE(daily.review_today,0)) review_remaining
  FROM ranked CROSS JOIN limits CROSS JOIN daily
), scheduled AS (
  SELECT classified.*,
    CASE
      WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN intrinsic_source
      WHEN p_filtered AND (
        p_card_filter = 'both'
        OR (p_card_filter = 'new' AND intrinsic_source = 'new')
        OR (p_card_filter = 'review' AND intrinsic_source IN ('review', 'learning'))
      ) THEN intrinsic_source
      WHEN p_filtered THEN NULL
      WHEN intrinsic_source='learning' AND p_card_filter IN ('both','review') THEN 'learning'
      WHEN intrinsic_source='review' AND p_card_filter<>'new' THEN 'review'
      WHEN intrinsic_source='new' AND p_card_filter<>'review' THEN 'new'
      ELSE 'practice'
    END queue_source
  FROM classified
), diagnostics AS (
  SELECT
    CASE WHEN p_filtered THEN
      count(*) FILTER (
        WHERE matches_filter AND has_status AND COALESCE(hidden,false)=false
          AND (frozen_until IS NULL OR frozen_until<=reference_now)
          AND COALESCE(fsrs_enabled,false)=false
      )
    ELSE (
      SELECT count(*)
      FROM scope
      LEFT JOIN (SELECT DISTINCT entry_id FROM learner_status) pool_status
        ON pool_status.entry_id=scope.id
      WHERE pool_status.entry_id IS NULL
    ) END AS new_pool_size,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false
        AND (frozen_until IS NULL OR frozen_until<=reference_now)
        AND COALESCE(fsrs_enabled,false)=true
        AND COALESCE(fsrs_last_interval,0)<1 AND next_review_at<=reference_now
    ) AS learning_due_count,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false
        AND (frozen_until IS NULL OR frozen_until<=reference_now)
        AND COALESCE(fsrs_enabled,false)=true
        AND fsrs_last_interval>=1 AND next_review_at<=reference_now
    ) AS review_pool_size
  FROM cards
), ordered AS (
  SELECT scheduled.*,
    CASE
      WHEN p_filtered AND p_queue_turn='review' AND queue_source IN ('review','learning') THEN 0
      WHEN p_filtered AND p_queue_turn='new' AND queue_source='new' THEN 0
      WHEN NOT p_filtered AND p_queue_turn='new' AND queue_source='new' THEN 0
      WHEN NOT p_filtered AND p_queue_turn='new' AND queue_source='learning' THEN 1
      WHEN NOT p_filtered AND p_queue_turn='new' AND queue_source='review' THEN 2
      WHEN queue_source='review' THEN 1
      WHEN queue_source='learning' THEN 2
      WHEN queue_source='new' THEN 3
      ELSE 4
    END source_rank
  FROM scheduled WHERE queue_source IS NOT NULL
)
SELECT entry_id,card_type_id,queue_source,
  row_number() OVER (ORDER BY
    CASE WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN 0 ELSE source_rank END,
    CASE WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN next_review_at END,
    CASE WHEN p_filtered THEN latest_event_at END DESC NULLS LAST,
    CASE WHEN queue_source IN ('review','learning') THEN next_review_at END,
    CASE WHEN queue_source IN ('new','practice') THEN mode_random END,
    CASE WHEN queue_source IN ('new','practice') THEN random() END) selection_order,
  COALESCE(daily.new_today,0),limits.new_limit,COALESCE(diagnostics.new_pool_size,0),
  COALESCE(diagnostics.learning_due_count,0),LEAST(COALESCE(diagnostics.review_pool_size,0),10)
FROM ordered CROSS JOIN daily CROSS JOIN limits CROSS JOIN diagnostics;
$_$;

CREATE OR REPLACE FUNCTION private.training_idiom_source_nodes_v1(p_user_id uuid, p_direction text, p_list_id uuid, p_list_type text, p_training_filter jsonb) RETURNS TABLE(content_node_id uuid, entry_id uuid, expression_source_path text, source_text_fingerprint text, created_at timestamp with time zone, source_revision text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
    AS $$
        WITH library_selection AS MATERIALIZED (SELECT entry_id FROM private.training_library_selection_entry_ids_v1(p_user_id,p_list_id,p_list_type,p_training_filter) WHERE p_training_filter?'librarySelection'), shared_entries AS MATERIALIZED (
    SELECT shared.entry_id FROM private.shared_author_entry_ids_v1(p_user_id) shared
  ), readable_dictionaries AS MATERIALIZED (
            SELECT dictionary.id,(dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id) AS full_access
              FROM public.dictionaries AS dictionary
             WHERE public.can_access_dictionary(p_user_id, dictionary.id, 'read')
    OR (dictionary.kind='user' AND EXISTS(SELECT 1 FROM shared_entries shared
      JOIN private.active_word_entries shared_entry ON shared_entry.id=shared.entry_id WHERE shared_entry.dictionary_id=dictionary.id))
        ), eligible_seed AS MATERIALIZED (
            SELECT status.entry_id
              FROM public.user_card_status AS status
              JOIN private.active_word_entries AS entry ON entry.id = status.entry_id
              LEFT JOIN readable_dictionaries AS readable
                ON readable.id = entry.dictionary_id
             WHERE status.user_id = p_user_id
               AND status.card_type_id IN ('word-to-definition', 'definition-to-word')
               AND (
                   COALESCE(status.in_learning, false)
                   OR COALESCE(status.fsrs_enabled, false)
                   OR COALESCE(status.fsrs_reps, 0) > 0
                   OR status.last_reviewed_at IS NOT NULL
               )
               AND (entry.dictionary_id IS NULL OR (readable.id IS NOT NULL
    AND (readable.full_access OR entry.id IN (SELECT shared.entry_id FROM shared_entries shared))))
            UNION
            SELECT known.entry_id
              FROM public.user_card_known_marks AS known
              JOIN private.active_word_entries AS entry ON entry.id = known.entry_id
              LEFT JOIN readable_dictionaries AS readable
                ON readable.id = entry.dictionary_id
             WHERE known.user_id = p_user_id
               AND known.card_type_id IN ('word-to-definition', 'definition-to-word')
               AND known.cleared_at IS NULL
               AND (entry.dictionary_id IS NULL OR (readable.id IS NOT NULL
    AND (readable.full_access OR entry.id IN (SELECT shared.entry_id FROM shared_entries shared))))
        ), eligible_source_groups AS MATERIALIZED (
            SELECT DISTINCT source_group.id
              FROM eligible_seed AS seed
              JOIN private.source_entry_bindings AS binding
                ON binding.word_entry_id = seed.entry_id
               AND binding.binding_state = 'active'
              JOIN private.platform_v2_headword_groups AS source_group
                ON source_group.management_kind = 'source'
               AND source_group.dictionary_id = binding.dictionary_id
               AND source_group.identity_scheme_version = binding.identity_scheme_version
               AND source_group.source_group_key = binding.source_group_key
        ), source_entries AS MATERIALIZED (
            SELECT entry_id
              FROM private.training_extra_source_entries_v1(
                  p_user_id, p_list_id, p_list_type, p_training_filter
              )
        ), source_nodes AS (
            SELECT
                node.id AS content_node_id,
                node.entry_id,
                node.diagnostic_locator AS expression_source_path,
                node.source_text_fingerprint,
                node.created_at,
                encode(
                    digest(
                        node.id::text || ':' || node.source_text_fingerprint,
                        'sha256'
                    ),
                    'hex'
                ) AS source_revision
              FROM private.platform_v2_content_nodes AS node
              LEFT JOIN private.source_entry_bindings AS source_binding
                ON source_binding.word_entry_id = node.entry_id
               AND source_binding.binding_state = 'active'
              LEFT JOIN private.platform_v2_headword_groups AS source_group
                ON source_group.management_kind = 'source'
               AND source_group.dictionary_id = source_binding.dictionary_id
               AND source_group.identity_scheme_version = source_binding.identity_scheme_version
               AND source_group.source_group_key = source_binding.source_group_key
              LEFT JOIN eligible_source_groups AS eligible_group
                ON eligible_group.id = source_group.id
              LEFT JOIN eligible_seed AS direct_seed
                ON direct_seed.entry_id = node.entry_id
             WHERE node.kind = 'idiom'
               AND node.binding_state = 'active'
               AND EXISTS (
                   SELECT 1 FROM source_entries AS source_entry
                   WHERE source_entry.entry_id = node.entry_id
               )
               AND CASE WHEN p_training_filter ? 'sourceWordStatus' THEN
                   private.training_source_word_selected_v1(p_user_id,node.entry_id,p_training_filter->>'sourceWordStatus')
                 ELSE eligible_group.id IS NOT NULL
                   OR (source_group.id IS NULL AND direct_seed.entry_id IS NOT NULL)
                 END
               AND (
                   SELECT count(*)
                     FROM private.platform_v2_content_nodes AS explanation
                    WHERE explanation.parent_content_node_id = node.id
                      AND explanation.kind = 'idiom-explanation'
                      AND explanation.binding_state = 'active'
               ) = 1
               AND EXISTS (
                   SELECT 1
                     FROM private.platform_v2_content_nodes AS explanation
                    WHERE explanation.parent_content_node_id = node.id
                      AND explanation.kind = 'idiom-explanation'
                      AND explanation.binding_state = 'active'
                      AND NULLIF(btrim(explanation.diagnostic_locator), '') IS NOT NULL
               )
               AND NOT EXISTS (
                   SELECT 1
                     FROM private.platform_v2_training_exercise_targets AS stale
                    WHERE stale.entry_id = node.entry_id
                      AND stale.content_node_id = node.id
                      AND stale.family = 'idiom'
                      AND stale.direction = p_direction
                      AND stale.source_text_fingerprint
                            IS DISTINCT FROM node.source_text_fingerprint
               )
        )
        SELECT * FROM source_nodes WHERE private.vocabulary_entry_selected_v1(entry_id,p_training_filter->'vocabulary') AND (NOT(p_training_filter?'librarySelection') OR entry_id IN (SELECT chosen.entry_id FROM library_selection chosen));
$$;

CREATE OR REPLACE FUNCTION public.read_training_recipe_availability_v1(p_user_id uuid, p_card_type_ids text[], p_list_id uuid DEFAULT NULL::uuid, p_list_type text DEFAULT 'curated'::text, p_training_filter jsonb DEFAULT '{}'::jsonb, p_exercise_family text DEFAULT 'meaning'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $_$
DECLARE
 v_filter jsonb:=COALESCE(p_training_filter,'{}')-'reviewTiming';
 v_modes text[]:=COALESCE(p_card_type_ids,ARRAY[]::text[]);
 v_now timestamptz:=private.training_reference_now_v1();
 v_timezone text:=private.training_user_timezone_v1(p_user_id);
 v_study_day date;
 v_due bigint:=0; v_reviews bigint:=0; v_new bigint:=0;
BEGIN
 IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
  RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
 END IF;
 IF NOT private.valid_source_word_status_v1(v_filter) OR NOT private.valid_vocabulary_selection_v1(v_filter->'vocabulary') OR NOT private.valid_training_library_selection_v1(v_filter->'librarySelection') THEN RAISE EXCEPTION 'invalid_training_filter'; END IF;
 IF jsonb_typeof(v_filter)<>'object' OR cardinality(v_modes)=0 OR p_exercise_family IS NULL
   OR p_exercise_family NOT IN ('meaning','idiom') OR p_list_type IS NULL OR p_list_type NOT IN ('curated','user') THEN
  RAISE EXCEPTION 'invalid_training_recipe';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_modes) m WHERE m IS NULL OR
   CASE WHEN p_exercise_family='meaning' THEN m NOT IN ('word-to-definition','definition-to-word')
    ELSE m NOT IN ('idiom:direct','idiom:reverse') END) THEN RAISE EXCEPTION 'invalid_training_recipe'; END IF;
 IF v_filter->>'presentationMode'='word-in-context' AND (p_exercise_family<>'meaning' OR v_modes<>ARRAY['definition-to-word']) THEN
  RAISE EXCEPTION 'word_context_requires_reverse_mode';
 END IF;
 IF p_list_id IS NOT NULL AND NOT (CASE WHEN p_list_type='user' THEN EXISTS(
   SELECT 1 FROM user_word_lists WHERE id=p_list_id AND (user_id=p_user_id
    OR id IN (SELECT collection_id FROM private.shared_collection_ids_v1(p_user_id))))
   ELSE EXISTS(SELECT 1 FROM word_lists WHERE id=p_list_id) END) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
 IF v_filter ? 'dictionaryScope' AND (p_list_id IS NOT NULL OR
    v_filter#>>'{dictionaryScope,mode}' IS NULL OR v_filter#>>'{dictionaryScope,mode}' NOT IN ('all','selected') OR
    NULLIF(v_filter#>>'{dictionaryScope,languageCode}','') IS NULL) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
 IF v_filter ? 'dictionaryScope' AND NOT EXISTS (
  SELECT 1 FROM dictionaries d WHERE d.language_code=v_filter#>>'{dictionaryScope,languageCode}'
   AND (public.can_access_dictionary(p_user_id,d.id,'read')
    OR (d.kind='user' AND EXISTS (SELECT 1 FROM private.shared_author_entry_memberships_v1 shared
      JOIN private.active_word_entries entry ON entry.id=shared.entry_id
      WHERE shared.user_id=p_user_id AND entry.dictionary_id=d.id)))
   AND (v_filter#>>'{dictionaryScope,mode}'='all' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter#>'{dictionaryScope,dictionaryIds}')='array'
      THEN v_filter#>'{dictionaryScope,dictionaryIds}' ELSE '[]'::jsonb END) requested(id)
    WHERE requested.id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND requested.id::uuid=d.id))) THEN RAISE EXCEPTION 'training_material_unavailable'; END IF;
 v_filter:=private.resolve_training_material_selection_v1(p_user_id,p_list_id,p_list_type,v_filter);
 v_timezone:=private.training_schedule_timezone_v1(v_timezone);
 v_study_day:=((v_now AT TIME ZONE v_timezone)-interval '4 hours')::date;
 IF p_exercise_family='meaning' THEN
  SELECT count(*) FILTER(WHERE fsrs_enabled AND introduced AND next_review_at<=v_now),
   count(*) FILTER(WHERE fsrs_enabled AND introduced),
   count(*) FILTER(WHERE intrinsic_source='new')
   INTO v_due,v_reviews,v_new
   FROM private.training_recipe_eligible_cards_v1(p_user_id,v_modes,p_list_id,p_list_type,'both','auto',ARRAY[]::uuid[],ARRAY[]::text[],v_filter,
    private.training_filter_target_date(v_filter) IS NOT NULL OR NULLIF(v_filter->>'sourceId','') IS NOT NULL
      OR NULLIF(trim(v_filter->>'sourceKind'),'') IS NOT NULL OR NULLIF(trim(v_filter->>'externalId'),'') IS NOT NULL,false);
 ELSE
  WITH selected AS (SELECT DISTINCT split_part(m,':',2) direction FROM unnest(v_modes) m),
  eligible AS (
   SELECT state.fsrs_enabled,COALESCE(state.fsrs_reps,0)>0 OR state.last_reviewed_at IS NOT NULL introduced,state.next_review_at
   FROM selected CROSS JOIN LATERAL private.training_idiom_source_nodes_v1(p_user_id,selected.direction,p_list_id,p_list_type,v_filter) source
   LEFT JOIN private.platform_v2_training_exercise_targets target ON target.entry_id=source.entry_id AND target.content_node_id=source.content_node_id AND target.family='idiom' AND target.direction=selected.direction
   LEFT JOIN user_training_exercise_state state ON state.user_id=p_user_id AND state.target_id=target.id
   WHERE NOT COALESCE(state.hidden,false) AND (state.frozen_until IS NULL OR state.frozen_until<=v_now)
    AND NOT private.training_pair_excluded_v1(p_user_id,'idiom',source.entry_id,source.content_node_id,source.source_text_fingerprint,NULL)
  ) SELECT count(*) FILTER(WHERE fsrs_enabled AND introduced AND next_review_at<=v_now),
   count(*) FILTER(WHERE fsrs_enabled AND introduced),count(*) FILTER(WHERE NOT COALESCE(fsrs_enabled,false))
   INTO v_due,v_reviews,v_new FROM eligible;
 END IF;
 RETURN jsonb_build_object('dueToday',v_due,'totalReviews',v_reviews,'newCards',v_new,
   'studyDay',v_study_day,'timezone',v_timezone,'asOf',v_now);
END;
$_$;
COMMIT;
