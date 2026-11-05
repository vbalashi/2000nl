BEGIN;
-- Broad scheduler planning must not leak into selective scalar sibling lookups.
-- Library and older internal callers retain this predicate as their reference.
ALTER FUNCTION private.vocabulary_entry_selected_v1(uuid,jsonb)
 SET enable_nestloop TO 'on';

-- Rank ranges find spelling candidates before the dictionary-wide scheduler.
CREATE INDEX word_entries_active_vocabulary_spelling_v1_idx
 ON public.word_entries(language_code,private.vocabulary_spelling_key_v1(headword))
 WHERE archived_at IS NULL;

-- Batch first-N membership before learner state, source-word status or session
-- size. Unit siblings outside the candidate scope still participate in ordering.
-- NULL candidate IDs are the indexed frequency seed; ARRAY(SELECT ...) returns
-- [] for an empty authorized scope, which must never become an unrestricted read.
CREATE FUNCTION private.vocabulary_selected_entry_ids_v1(p_value jsonb,p_candidate_entry_ids uuid[] DEFAULT NULL)
RETURNS TABLE(entry_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp
SET enable_nestloop=on AS $$
 WITH criteria AS MATERIALIZED (
  SELECT p_value value WHERE private.valid_vocabulary_selection_v1(p_value)
 ), candidate_ids AS MATERIALIZED (
  SELECT unnest(p_candidate_entry_ids) id
 ), raw_candidates AS MATERIALIZED (
  SELECT e.id,e.dictionary_id,e.language_code,e.headword,e.meaning_id,e.part_of_speech
  FROM criteria c CROSS JOIN private.vocabulary_frequency_ranks r
  JOIN private.active_word_entries e ON e.language_code=r.language_code
   AND private.vocabulary_spelling_key_v1(e.headword)=r.spelling_key
  JOIN public.dictionaries d ON d.id=e.dictionary_id AND d.kind<>'user'
  WHERE c.value->>'mode'='frequency' AND r.profile=c.value->>'profile'
   AND r.rank BETWEEN (c.value->>'from')::bigint AND (c.value->>'to')::bigint
   AND (p_candidate_entry_ids IS NULL OR e.id IN (SELECT id FROM candidate_ids))
  UNION ALL
  SELECT e.id,e.dictionary_id,e.language_code,e.headword,e.meaning_id,e.part_of_speech
  FROM criteria c CROSS JOIN private.active_word_entries e
  WHERE c.value->>'mode'='all'
   AND (p_candidate_entry_ids IS NULL OR e.id IN (SELECT id FROM candidate_ids))
 ), candidate_bindings AS MATERIALIZED (
  SELECT c.*,b.dictionary_id binding_dictionary_id,b.identity_scheme_version,b.source_group_key,
   b.word_entry_id IS NOT NULL source_bound,
   CASE WHEN b.word_entry_id IS NULL THEN EXISTS(SELECT 1 FROM private.platform_v2_headword_groups g
    WHERE g.management_kind='user' AND g.singleton_entry_id=c.id) ELSE false END user_singleton
  FROM raw_candidates c LEFT JOIN private.source_entry_bindings b
   ON b.word_entry_id=c.id AND b.binding_state='active'
 ), source_groups AS MATERIALIZED (
  SELECT DISTINCT binding_dictionary_id AS dictionary_id,identity_scheme_version,source_group_key
  FROM candidate_bindings WHERE source_bound AND p_value->>'meanings'<>'all'
 ), source_members AS MATERIALIZED (
  SELECT w.id,w.part_of_speech,w.meaning_id,b.dictionary_id,b.identity_scheme_version,b.source_group_key,b.sense_ordinal
  FROM source_groups g JOIN private.source_entry_bindings b
   ON b.dictionary_id=g.dictionary_id AND b.identity_scheme_version=g.identity_scheme_version
    AND b.source_group_key=g.source_group_key AND b.binding_state='active'
  JOIN private.active_word_entries w ON w.id=b.word_entry_id
 ), fallback_groups AS MATERIALIZED (
  SELECT DISTINCT dictionary_id,language_code,headword
  FROM candidate_bindings WHERE NOT source_bound AND NOT user_singleton AND p_value->>'meanings'<>'all'
 ), fallback_members AS MATERIALIZED (
  SELECT w.id,w.part_of_speech,w.meaning_id,g.dictionary_id,g.language_code,g.headword
  FROM fallback_groups g JOIN private.active_word_entries w
   ON w.dictionary_id IS NOT DISTINCT FROM g.dictionary_id AND w.language_code=g.language_code AND w.headword=g.headword
 ), unit_rows AS MATERIALIZED (
  -- Normalize each distinct raw POS once, and keep raw JSON out of these sets.
  SELECT id,part_of_speech,meaning_id FROM raw_candidates
  UNION SELECT id,part_of_speech,meaning_id FROM source_members
  UNION SELECT id,part_of_speech,meaning_id FROM fallback_members
 ), part_values AS MATERIALIZED (
  SELECT DISTINCT COALESCE(part_of_speech,'') part_key FROM unit_rows
 ), part_map AS MATERIALIZED (
  SELECT part_key,CASE WHEN p_value->>'meanings'='all' AND p_value->'materialKinds'='[]'::jsonb THEN NULL
   ELSE private.normalize_training_part_of_speech_v1(part_key) END normalized_part FROM part_values
 ), normalized_units AS MATERIALIZED (
  SELECT u.*,m.normalized_part FROM unit_rows u JOIN part_map m ON m.part_key=COALESCE(u.part_of_speech,'')
 ), pointer_ids AS MATERIALIZED (
  -- This predicate uses the existing pointer-only partial index, without
  -- repeatedly detoasting dictionary articles for each candidate and sibling.
  SELECT id FROM public.word_entries WHERE private.is_pointer_only_dictionary_entry_v1(raw)
 ), units AS MATERIALIZED (
  SELECT u.id,u.meaning_id,COALESCE(u.normalized_part,lower(btrim(u.part_of_speech)),'') unit_part,
   u.normalized_part IS NOT NULL is_word,u.id IN (SELECT id FROM pointer_ids) pointer_only
  FROM normalized_units u
 ), selected_candidates AS MATERIALIZED (
  SELECT c.*,u.pointer_only FROM candidate_bindings c JOIN units u ON u.id=c.id
  WHERE p_value->'materialKinds'='[]'::jsonb
   OR p_value->'materialKinds' ? CASE WHEN u.is_word THEN 'word' ELSE 'other' END
 ), source_ordinals AS MATERIALIZED (
  SELECT m.id,row_number() OVER(PARTITION BY m.dictionary_id,m.identity_scheme_version,m.source_group_key,u.unit_part
   ORDER BY COALESCE(m.sense_ordinal,u.meaning_id,2147483647),m.id) ordinal
  FROM source_members m JOIN units u ON u.id=m.id WHERE NOT u.pointer_only
 ), fallback_ordinals AS MATERIALIZED (
  SELECT m.id,row_number() OVER(PARTITION BY m.dictionary_id,m.language_code,m.headword,u.unit_part
   ORDER BY COALESCE(u.meaning_id,2147483647),m.id) ordinal
  FROM fallback_members m JOIN units u ON u.id=m.id WHERE NOT u.pointer_only
 )
 SELECT c.id FROM selected_candidates c WHERE p_value->>'meanings'='all'
 UNION ALL
 SELECT c.id FROM selected_candidates c
 LEFT JOIN source_ordinals s ON s.id=c.id AND c.source_bound
 LEFT JOIN fallback_ordinals f ON f.id=c.id AND NOT c.source_bound AND NOT c.user_singleton
 WHERE p_value->>'meanings'<>'all' AND NOT c.pointer_only AND (
   (c.source_bound AND s.ordinal<=(p_value->>'meanings')::integer)
   OR (NOT c.source_bound AND (c.user_singleton OR f.ordinal<=(p_value->>'meanings')::integer)));
$$;
REVOKE ALL ON FUNCTION private.vocabulary_selected_entry_ids_v1(jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

-- Resolve renderable context parents once, preserving legacy familiar-word
-- rules and the explicit all/learning rules before applying card directions.
CREATE FUNCTION private.training_word_context_entry_ids_v1(p_user uuid,p_filter jsonb,p_candidate_entry_ids uuid[])
RETURNS TABLE(entry_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp
SET enable_nestloop=on AS $$
 WITH requested AS MATERIALIZED (
  SELECT DISTINCT unnest(p_candidate_entry_ids) entry_id
 ), familiar AS MATERIALIZED (
  SELECT s.entry_id,bool_or(COALESCE(s.in_learning,false) OR COALESCE(s.fsrs_enabled,false)) learning,
   bool_or(COALESCE(s.in_learning,false) OR COALESCE(s.fsrs_enabled,false)
    OR COALESCE(s.fsrs_reps,0)>0 OR s.last_reviewed_at IS NOT NULL) familiar
  FROM public.user_card_status s
  WHERE s.user_id=p_user AND s.card_type_id IN ('word-to-definition','definition-to-word')
   AND p_filter->>'sourceWordStatus' IS DISTINCT FROM 'all'
  GROUP BY s.entry_id
 ), known AS MATERIALIZED (
  SELECT DISTINCT k.entry_id FROM public.user_card_known_marks k
  WHERE k.user_id=p_user AND k.card_type_id IN ('word-to-definition','definition-to-word')
   AND k.cleared_at IS NULL AND p_filter->>'sourceWordStatus' IS DISTINCT FROM 'all'
 ), examples AS MATERIALIZED (
  SELECT DISTINCT n.entry_id FROM requested r JOIN private.platform_v2_content_nodes n ON n.entry_id=r.entry_id
  WHERE n.kind='example' AND n.binding_state='active'
   AND NULLIF(btrim(n.diagnostic_locator),'') IS NOT NULL
   AND n.diagnostic_locator ~ '^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$'
 )
 SELECT e.entry_id FROM examples e LEFT JOIN familiar s ON s.entry_id=e.entry_id
 LEFT JOIN known k ON k.entry_id=e.entry_id
 WHERE CASE WHEN p_filter?'sourceWordStatus' THEN p_filter->>'sourceWordStatus'='all'
   OR (p_filter->>'sourceWordStatus'='learning' AND s.learning AND k.entry_id IS NULL)
  ELSE s.familiar OR k.entry_id IS NOT NULL END;
$$;
REVOKE ALL ON FUNCTION private.training_word_context_entry_ids_v1(uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.training_extra_source_entries_v1(p_user_id uuid, p_list_id uuid, p_list_type text, p_training_filter jsonb) RETURNS TABLE(entry_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $_$
DECLARE
  v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
  v_dictionary_scope jsonb;
  v_dictionary_mode text;
  v_dictionary_language text;
  v_date_window text;
  v_source_id uuid;
  v_target_date date;
  v_timezone text;
  v_activity_requested boolean;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user_id'; END IF;
  IF jsonb_typeof(v_filter) <> 'object' THEN
    RAISE EXCEPTION 'invalid_training_filter';
  END IF;
  IF p_list_type IS NOT NULL AND p_list_type NOT IN ('curated', 'user') THEN
    RAISE EXCEPTION 'invalid_training_list_type';
  END IF;

  v_date_window := COALESCE(NULLIF(trim(v_filter->>'dateWindow'), ''), 'all');
  IF v_date_window NOT IN ('all', 'today', 'yesterday', 'daysAgo') THEN
    RAISE EXCEPTION 'invalid_training_date_window';
  END IF;
  IF v_date_window = 'daysAgo' AND (
    COALESCE(v_filter->>'daysAgo', '') !~ '^[0-9]{1,3}$'
    OR (v_filter->>'daysAgo')::integer > 365
  ) THEN
    RAISE EXCEPTION 'invalid_training_days_ago';
  END IF;

  IF v_filter ? 'dictionaryScope' THEN
    v_dictionary_scope := v_filter->'dictionaryScope';
    v_dictionary_mode := NULLIF(trim(v_dictionary_scope->>'mode'), '');
    v_dictionary_language := NULLIF(trim(v_dictionary_scope->>'languageCode'), '');
    IF p_list_id IS NOT NULL OR jsonb_typeof(v_dictionary_scope) <> 'object'
       OR v_dictionary_mode IS NULL OR v_dictionary_mode NOT IN ('all', 'selected')
       OR v_dictionary_language IS NULL THEN
      RAISE EXCEPTION 'training_material_unavailable';
    END IF;
    IF v_dictionary_mode = 'selected' AND (
      jsonb_typeof(v_dictionary_scope->'dictionaryIds') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_dictionary_scope->'dictionaryIds') = 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_dictionary_scope->'dictionaryIds') AS requested(id)
        WHERE requested.id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    ) THEN
      RAISE EXCEPTION 'training_material_unavailable';
    END IF;
  END IF;

  IF NULLIF(v_filter->>'sourceId', '') IS NOT NULL THEN
    IF v_filter->>'sourceId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid_training_source_id';
    END IF;
    v_source_id := (v_filter->>'sourceId')::uuid;
  END IF;
  v_activity_requested := v_date_window <> 'all'
    OR v_source_id IS NOT NULL
    OR NULLIF(trim(v_filter->>'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(v_filter->>'externalId'), '') IS NOT NULL;
  v_target_date := private.training_filter_target_date_at(
    v_filter, private.training_reference_now_v1()
  );
  v_timezone := private.training_schedule_timezone_v1(
    COALESCE(
      NULLIF(trim(v_filter->>'timezone'), ''),
      private.training_user_timezone_v1(p_user_id)
    )
  );

  RETURN QUERY
  WITH shared_entries AS MATERIALIZED (
    SELECT shared.entry_id FROM private.shared_author_entry_ids_v1(p_user_id) shared
  ), readable_dictionaries AS MATERIALIZED (
    SELECT dictionary.id, dictionary.language_code,dictionary.kind,dictionary.owner_user_id
    FROM public.dictionaries AS dictionary
    WHERE public.can_access_dictionary(p_user_id, dictionary.id, 'read')
    OR (dictionary.kind='user' AND EXISTS(SELECT 1 FROM shared_entries shared
      JOIN private.active_word_entries shared_entry ON shared_entry.id=shared.entry_id WHERE shared_entry.dictionary_id=dictionary.id))
  ), selected_dictionaries AS MATERIALIZED (
    SELECT requested.id::uuid AS id
    FROM jsonb_array_elements_text(
      CASE WHEN v_dictionary_mode = 'selected'
        THEN v_dictionary_scope->'dictionaryIds'
        ELSE '[]'::jsonb END
    ) AS requested(id)
  ), scope AS MATERIALIZED (
    SELECT default_scope.entry_id AS id
    FROM private.default_training_scope_entries_v1 AS default_scope
    WHERE p_list_id IS NULL AND v_dictionary_mode IS NULL

    UNION ALL
    SELECT item.word_id AS id
    FROM public.word_list_items AS item
    WHERE p_list_id IS NOT NULL AND v_dictionary_mode IS NULL
      AND COALESCE(p_list_type, 'curated') = 'curated'
      AND item.list_id = p_list_id

    UNION ALL
    SELECT item.word_id AS id
    FROM public.user_word_list_items AS item
    JOIN public.user_word_lists AS list ON list.id = item.list_id
    WHERE p_list_id IS NOT NULL AND v_dictionary_mode IS NULL
      AND p_list_type = 'user' AND (list.user_id = p_user_id OR list.id IN (SELECT shared.collection_id FROM private.shared_collection_ids_v1(p_user_id) shared))
      AND item.list_id = p_list_id

    UNION ALL
    SELECT entry.id
    FROM private.active_word_entries AS entry
    JOIN readable_dictionaries AS dictionary ON dictionary.id = entry.dictionary_id
    WHERE v_dictionary_mode IN ('all', 'selected')
      AND entry.language_code = v_dictionary_language
      AND dictionary.language_code = v_dictionary_language
      AND (v_dictionary_mode = 'all' OR EXISTS (
        SELECT 1 FROM selected_dictionaries AS selected
        WHERE selected.id = entry.dictionary_id
      ))
  ), entry_metadata AS MATERIALIZED (
    SELECT entry.id,entry.language_code,entry.dictionary_id,entry.part_of_speech,entry.gender
    FROM scope
    JOIN private.active_word_entries AS entry ON entry.id=scope.id
    LEFT JOIN readable_dictionaries AS dictionary ON dictionary.id=entry.dictionary_id
    WHERE (entry.dictionary_id IS NULL OR dictionary.id IS NOT NULL)
      AND (entry.dictionary_id IS NULL OR dictionary.kind<>'user' OR dictionary.owner_user_id=p_user_id
        OR entry.id IN (SELECT shared.entry_id FROM shared_entries shared))
  ), material_keys AS MATERIALIZED (
    SELECT DISTINCT language_code,dictionary_id FROM entry_metadata
  ), selected_material_keys AS MATERIALIZED (
    SELECT k.language_code,k.dictionary_id FROM material_keys k
    WHERE private.training_material_entry_selected_v1(k.language_code,k.dictionary_id,v_filter)
  ), pointer_ids AS MATERIALIZED (
    SELECT id FROM public.word_entries WHERE private.is_pointer_only_dictionary_entry_v1(raw)
  ), activity_entries AS MATERIALIZED (
      SELECT DISTINCT event.entry_id
      FROM public.user_card_action_events AS event
      LEFT JOIN public.learning_sources AS source ON source.id = event.source_id
      WHERE v_activity_requested AND event.user_id = p_user_id
        AND event.entry_id IN (SELECT scoped.id FROM entry_metadata scoped)
        AND event.card_type_id IN ('word-to-definition', 'definition-to-word')
        AND (v_target_date IS NULL OR
          private.training_filter_local_date(event.created_at, v_timezone) = v_target_date)
        AND (v_source_id IS NULL OR event.source_id = v_source_id)
        AND (NULLIF(trim(v_filter->>'sourceKind'), '') IS NULL
          OR source.kind = v_filter->>'sourceKind'
          OR source.provider = v_filter->>'sourceKind'
          OR (v_filter->>'sourceKind' = 'youtube' AND
            (source.kind IN ('youtube', 'youtube_video') OR source.provider = 'youtube')))
        AND (NULLIF(trim(v_filter->>'externalId'), '') IS NULL
          OR source.external_id = v_filter->>'externalId')
  )
  SELECT DISTINCT entry.id
  FROM entry_metadata entry
  WHERE EXISTS (
    SELECT 1 FROM selected_material_keys k
    WHERE k.language_code=entry.language_code AND k.dictionary_id IS NOT DISTINCT FROM entry.dictionary_id
  )
    AND entry.id NOT IN (SELECT id FROM pointer_ids)
    AND CASE WHEN v_filter ? 'partOfSpeech' OR v_filter ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(entry.part_of_speech,entry.gender,v_filter)
      ELSE true END
    AND (NOT v_activity_requested OR entry.id IN (SELECT activity.entry_id FROM activity_entries activity));
END;
$_$;

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
), filter_values AS MATERIALIZED (
  SELECT args.*,
    private.vocabulary_has_selection_v1(args.filter_data->'vocabulary') vocabulary_active,
    (args.filter_data->'vocabulary' IS NULL OR args.filter_data->'vocabulary'='null'::jsonb
      OR private.valid_vocabulary_selection_v1(args.filter_data->'vocabulary')) vocabulary_allowed,
    private.training_review_early_v1(args.filter_data,p_card_filter) review_early,
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
), frequency_selection AS MATERIALIZED (
    SELECT chosen.entry_id FROM filter_values selected_filter
    CROSS JOIN LATERAL private.vocabulary_selected_entry_ids_v1(selected_filter.filter_data->'vocabulary') chosen
    WHERE selected_filter.filter_data#>>'{vocabulary,mode}'='frequency' AND selected_filter.vocabulary_allowed
), raw_scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN scope_entry.entry_id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NULL
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
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN scope_entry.entry_id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NULL
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
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN entry.id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NOT NULL
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
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN entry.id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NULL
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

), vocabulary_selection AS MATERIALIZED (
    SELECT chosen.entry_id FROM filter_values selected_filter
    CROSS JOIN LATERAL private.vocabulary_selected_entry_ids_v1(
      selected_filter.filter_data->'vocabulary',ARRAY(SELECT id FROM raw_scope)) chosen
    WHERE COALESCE(selected_filter.filter_data#>>'{vocabulary,mode}','all')<>'frequency'
      AND selected_filter.vocabulary_active AND selected_filter.vocabulary_allowed
), material_keys AS MATERIALIZED (
    SELECT DISTINCT entry.language_code,entry.dictionary_id FROM raw_scope raw
    JOIN private.active_word_entries entry ON entry.id=raw.id
), selected_material_keys AS MATERIALIZED (
    SELECT material_key.* FROM material_keys material_key CROSS JOIN filter_values material_filter
    WHERE private.training_material_entry_selected_v1(material_key.language_code,
      material_key.dictionary_id,material_filter.filter_data)
), scope AS MATERIALIZED (
    SELECT raw_scope.id FROM raw_scope
    JOIN private.active_word_entries material_entry ON material_entry.id=raw_scope.id
    LEFT JOIN public.dictionaries authority_dictionary ON authority_dictionary.id=material_entry.dictionary_id
    CROSS JOIN filter_values material_filter
    WHERE (material_entry.dictionary_id IS NULL OR authority_dictionary.kind<>'user'
      OR authority_dictionary.owner_user_id=p_user_id OR material_entry.id IN (SELECT entry_id FROM shared_entries))
      AND EXISTS (SELECT 1 FROM selected_material_keys material_key
        WHERE material_key.language_code=material_entry.language_code
          AND material_key.dictionary_id IS NOT DISTINCT FROM material_entry.dictionary_id)
      AND material_filter.vocabulary_allowed
      AND CASE WHEN NOT material_filter.vocabulary_active THEN true
        WHEN material_filter.filter_data#>>'{vocabulary,mode}'='frequency'
        THEN material_entry.id IN (SELECT entry_id FROM frequency_selection)
        ELSE material_entry.id IN (SELECT entry_id FROM vocabulary_selection) END
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
), context_entries AS MATERIALIZED (
  SELECT chosen.entry_id FROM filter_values context_filter
  CROSS JOIN LATERAL private.training_word_context_entry_ids_v1(p_user_id,context_filter.filter_data,
    ARRAY(SELECT id FROM scope)) chosen
  WHERE context_filter.filter_data->>'presentationMode'='word-in-context'
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
      WHEN (SELECT review_early FROM filter_values)
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
    AND (NOT (SELECT review_early FROM filter_values)
      OR (cards.introduced AND cards.fsrs_enabled=true))
    AND CASE
      WHEN (SELECT filter_data->>'presentationMode' FROM filter_values)
        = 'word-in-context'
      THEN cards.card_type_id='definition-to-word' AND cards.entry_id IN (SELECT entry_id FROM context_entries)
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
), filter_values AS MATERIALIZED (
  SELECT args.*,
    private.vocabulary_has_selection_v1(args.filter_data->'vocabulary') vocabulary_active,
    (args.filter_data->'vocabulary' IS NULL OR args.filter_data->'vocabulary'='null'::jsonb
      OR private.valid_vocabulary_selection_v1(args.filter_data->'vocabulary')) vocabulary_allowed,
    private.training_review_early_v1(args.filter_data,p_card_filter) review_early,
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
), frequency_selection AS MATERIALIZED (
    SELECT chosen.entry_id FROM filter_values selected_filter
    CROSS JOIN LATERAL private.vocabulary_selected_entry_ids_v1(selected_filter.filter_data->'vocabulary') chosen
    WHERE selected_filter.filter_data#>>'{vocabulary,mode}'='frequency' AND selected_filter.vocabulary_allowed
), raw_scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN scope_entry.entry_id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NULL
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
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN scope_entry.entry_id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NULL
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
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN entry.id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NOT NULL
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
  WHERE CASE WHEN filter_values.filter_data#>>'{vocabulary,mode}'='frequency' THEN entry.id IN (SELECT entry_id FROM frequency_selection) ELSE true END
    AND p_list_id IS NULL
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

), vocabulary_selection AS MATERIALIZED (
    SELECT chosen.entry_id FROM filter_values selected_filter
    CROSS JOIN LATERAL private.vocabulary_selected_entry_ids_v1(
      selected_filter.filter_data->'vocabulary',ARRAY(SELECT id FROM raw_scope)) chosen
    WHERE COALESCE(selected_filter.filter_data#>>'{vocabulary,mode}','all')<>'frequency'
      AND selected_filter.vocabulary_active AND selected_filter.vocabulary_allowed
), material_keys AS MATERIALIZED (
    SELECT DISTINCT entry.language_code,entry.dictionary_id FROM raw_scope raw
    JOIN private.active_word_entries entry ON entry.id=raw.id
), selected_material_keys AS MATERIALIZED (
    SELECT material_key.* FROM material_keys material_key CROSS JOIN filter_values material_filter
    WHERE private.training_material_entry_selected_v1(material_key.language_code,
      material_key.dictionary_id,material_filter.filter_data)
), scope AS MATERIALIZED (
    SELECT raw_scope.id FROM raw_scope
    JOIN private.active_word_entries material_entry ON material_entry.id=raw_scope.id
    LEFT JOIN public.dictionaries authority_dictionary ON authority_dictionary.id=material_entry.dictionary_id
    CROSS JOIN filter_values material_filter
    WHERE (material_entry.dictionary_id IS NULL OR authority_dictionary.kind<>'user'
      OR authority_dictionary.owner_user_id=p_user_id OR material_entry.id IN (SELECT entry_id FROM shared_entries))
      AND EXISTS (SELECT 1 FROM selected_material_keys material_key
        WHERE material_key.language_code=material_entry.language_code
          AND material_key.dictionary_id IS NOT DISTINCT FROM material_entry.dictionary_id)
      AND material_filter.vocabulary_allowed
      AND CASE WHEN NOT material_filter.vocabulary_active THEN true
        WHEN material_filter.filter_data#>>'{vocabulary,mode}'='frequency'
        THEN material_entry.id IN (SELECT entry_id FROM frequency_selection)
        ELSE material_entry.id IN (SELECT entry_id FROM vocabulary_selection) END
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
), context_entries AS MATERIALIZED (
  SELECT chosen.entry_id FROM filter_values context_filter
  CROSS JOIN LATERAL private.training_word_context_entry_ids_v1(p_user_id,context_filter.filter_data,
    ARRAY(SELECT id FROM scope)) chosen
  WHERE context_filter.filter_data->>'presentationMode'='word-in-context'
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
      WHEN (SELECT review_early FROM filter_values)
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
    AND (NOT (SELECT review_early FROM filter_values)
      OR (cards.introduced AND cards.fsrs_enabled=true))
    AND CASE
      WHEN (SELECT filter_data->>'presentationMode' FROM filter_values)
        = 'word-in-context'
      THEN cards.card_type_id='definition-to-word' AND cards.entry_id IN (SELECT entry_id FROM context_entries)
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
      WHEN (SELECT review_early FROM filter_values) THEN intrinsic_source
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
    CASE WHEN (SELECT review_early FROM filter_values) THEN 0 ELSE source_rank END,
    CASE WHEN (SELECT review_early FROM filter_values) THEN next_review_at END,
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
        WITH selection_flags AS MATERIALIZED (SELECT private.vocabulary_has_selection_v1(p_training_filter->'vocabulary') active,
          (p_training_filter->'vocabulary' IS NULL OR p_training_filter->'vocabulary'='null'::jsonb
            OR private.valid_vocabulary_selection_v1(p_training_filter->'vocabulary')) allowed), library_selection AS MATERIALIZED (SELECT entry_id FROM private.training_library_selection_entry_ids_v1(p_user_id,p_list_id,p_list_type,p_training_filter) WHERE p_training_filter?'librarySelection'), shared_entries AS MATERIALIZED (
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
        ), vocabulary_selection AS MATERIALIZED (
            SELECT chosen.entry_id FROM private.vocabulary_selected_entry_ids_v1(
              p_training_filter->'vocabulary',ARRAY(SELECT entry_id FROM source_entries)) chosen
            WHERE (SELECT active AND allowed FROM selection_flags)
        ), selected_source_entries AS MATERIALIZED (
            SELECT entry_id FROM source_entries WHERE (SELECT allowed FROM selection_flags) AND (
              NOT (SELECT active FROM selection_flags)
              OR entry_id IN (SELECT entry_id FROM vocabulary_selection))
        ), legacy_eligible_entries AS MATERIALIZED (
            SELECT DISTINCT parent.entry_id FROM selected_source_entries parent
              LEFT JOIN private.source_entry_bindings AS source_binding
                ON source_binding.word_entry_id = parent.entry_id
               AND source_binding.binding_state = 'active'
              LEFT JOIN private.platform_v2_headword_groups AS source_group
                ON source_group.management_kind = 'source'
               AND source_group.dictionary_id = source_binding.dictionary_id
               AND source_group.identity_scheme_version = source_binding.identity_scheme_version
               AND source_group.source_group_key = source_binding.source_group_key
              LEFT JOIN eligible_source_groups AS eligible_group
                ON eligible_group.id = source_group.id
              LEFT JOIN eligible_seed AS direct_seed
                ON direct_seed.entry_id = parent.entry_id
             WHERE eligible_group.id IS NOT NULL OR (source_group.id IS NULL AND direct_seed.entry_id IS NOT NULL)
        ), learning_entries AS MATERIALIZED (
            SELECT DISTINCT status.entry_id FROM public.user_card_status status
            WHERE status.user_id=p_user_id AND status.card_type_id IN ('word-to-definition','definition-to-word')
              AND (COALESCE(status.in_learning,false) OR COALESCE(status.fsrs_enabled,false))
              AND NOT EXISTS (SELECT 1 FROM public.user_card_known_marks known
                WHERE known.user_id=status.user_id AND known.entry_id=status.entry_id
                  AND known.card_type_id IN ('word-to-definition','definition-to-word') AND known.cleared_at IS NULL)
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
             WHERE node.kind = 'idiom'
               AND node.binding_state = 'active'
               AND EXISTS (
                   SELECT 1 FROM selected_source_entries AS source_entry
                   WHERE source_entry.entry_id = node.entry_id
               )
               AND CASE WHEN p_training_filter ? 'sourceWordStatus' THEN
                   p_training_filter->>'sourceWordStatus'='all'
                   OR (p_training_filter->>'sourceWordStatus'='learning'
                     AND node.entry_id IN (SELECT entry_id FROM learning_entries))
                 ELSE node.entry_id IN (SELECT entry_id FROM legacy_eligible_entries)
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
        SELECT * FROM source_nodes WHERE (NOT(p_training_filter?'librarySelection') OR entry_id IN (SELECT chosen.entry_id FROM library_selection chosen));
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
