-- Apply ordinary Dutch POS and noun-article filters inside the canonical
-- candidate selector, before queue composition and session membership latch.
BEGIN;

CREATE OR REPLACE FUNCTION private.normalize_training_part_of_speech_v1(
  p_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
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
    WHEN 'afk' THEN 'afk' WHEN 'afkorting' THEN 'afk'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.training_lexical_candidate_matches_v1(
  p_part_of_speech text,
  p_gender text,
  p_training_filter jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
  v_requested_pos text[] := ARRAY[]::text[];
  v_requested_articles text[] := ARRAY[]::text[];
  v_entry_pos text;
  v_entry_gender text;
BEGIN
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
        OR value NOT IN ('zn','ww','bn','bw','vz','vnw','vw','tw','lidw','tsw','afk')
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
      RETURN COALESCE(v_entry_gender = ANY(v_requested_articles), false);
    END IF;
    RETURN cardinality(v_requested_pos) > 0
      AND v_entry_pos IS NOT NULL
      AND v_entry_pos = ANY(v_requested_pos);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_training_part_of_speech_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_lexical_candidate_matches_v1(text,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION private.training_lexical_candidate_matches_v1(text,text,jsonb)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION private.training_scheduler_candidates_v2(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_queue_turn text,
  p_exclude_entry_ids uuid[],
  p_exclude_card_keys text[],
  p_training_filter jsonb,
  p_filtered boolean,
  p_enforce_daily_limits boolean
)
RETURNS TABLE(
  entry_id uuid,
  card_type_id text,
  queue_source text,
  selection_order bigint,
  new_today bigint,
  daily_new_limit bigint,
  new_pool_size bigint,
  learning_due_count bigint,
  review_pool_size bigint
)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
WITH args AS (
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
    NULLIF(trim(filter_data->>'externalId'),'') external_id
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
  SELECT dictionary.id
  FROM dictionaries dictionary
  WHERE can_access_dictionary(p_user_id,dictionary.id,'read')
), scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  LEFT JOIN word_entries lexical_entry
    ON (filter_values.filter_data ? 'partOfSpeech'
      OR filter_values.filter_data ? 'nounArticles')
      AND lexical_entry.id=scope_entry.entry_id
  WHERE p_list_id IS NULL
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        lexical_entry.part_of_speech, lexical_entry.gender,
        filter_values.filter_data
      )
      ELSE true
    END
  UNION ALL
  SELECT entry.id
  FROM word_entries entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
  WHERE p_list_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM word_entries pointer_entry
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
        WHERE item.list_id=p_list_id AND item.word_id=entry.id AND list.user_id=p_user_id
      )))
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        entry.part_of_speech, entry.gender, filter_values.filter_data
      )
      ELSE true
    END
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
), source_bound_entries AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id
  FROM private.source_entry_bindings binding
  WHERE binding.binding_state = 'active'
), ordinary_source_introductions AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id,
    lag(binding.word_entry_id) OVER (
      PARTITION BY binding.dictionary_id, binding.identity_scheme_version,
        binding.source_group_key
      ORDER BY binding.sense_ordinal, binding.word_entry_id
    ) AS predecessor_entry_id
  FROM private.source_entry_bindings binding
  JOIN private.platform_v2_content_nodes definition
    ON definition.entry_id = binding.word_entry_id
   AND definition.binding_state = 'active'
   AND definition.parent_content_node_id IS NULL
   AND definition.kind = 'definition'
  LEFT JOIN unrenderable_direct_entries unrenderable
    ON unrenderable.entry_id = binding.word_entry_id
  WHERE binding.binding_state = 'active'
    AND unrenderable.entry_id IS NULL
), cards AS (
  SELECT scope.id entry_id,mode_order.card_type_id,status.fsrs_enabled,
    status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    status.entry_id IS NOT NULL has_status,matched.entry_id IS NOT NULL matches_filter,
    matched.latest_event_at,mode_order.mode_random,
    filter_values.now_at reference_now,
    study_day_new_words.word_id IS NOT NULL new_seen_today,
    study_day_new_cards.word_id IS NOT NULL new_card_seen_today,
    CASE
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
    AND (
      card_type_id <> 'word-to-definition'
      OR unrenderable.entry_id IS NULL
    )
    AND (
      intrinsic_source <> 'new'
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
      WHEN p_filtered AND (
        p_card_filter = 'both'
        OR (p_card_filter = 'new' AND intrinsic_source = 'new')
        OR (p_card_filter = 'review' AND intrinsic_source IN ('review', 'learning'))
      ) THEN intrinsic_source
      WHEN p_filtered THEN NULL
      WHEN intrinsic_source='learning' AND p_card_filter='both' THEN 'learning'
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
  row_number() OVER (ORDER BY source_rank,
    CASE WHEN p_filtered THEN latest_event_at END DESC NULLS LAST,
    CASE WHEN queue_source IN ('review','learning') THEN next_review_at END,
    CASE WHEN queue_source IN ('new','practice') THEN mode_random END,
    CASE WHEN queue_source IN ('new','practice') THEN random() END) selection_order,
  COALESCE(daily.new_today,0),limits.new_limit,COALESCE(diagnostics.new_pool_size,0),
  COALESCE(diagnostics.learning_due_count,0),LEAST(COALESCE(diagnostics.review_pool_size,0),10)
FROM ordered CROSS JOIN daily CROSS JOIN limits CROSS JOIN diagnostics;
$$;

ALTER FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) IS
  'Canonical Training candidates with learner-local study-day and pre-queue Dutch lexical filters; finite session size is the only budget.';

-- Lexical filters select candidates from the ordinary pool. Date/source filters
-- retain their distinct history-matching semantics and must not be inferred
-- from the mere presence of any training_filter key.
CREATE OR REPLACE FUNCTION public.get_next_filtered_card(
  p_user_id uuid,
  p_card_type_ids text[],
  p_exclude_entry_ids uuid[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_queue_turn text,
  p_exclude_card_keys text[],
  p_training_filter jsonb,
  p_allow_practice boolean
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  selected record;
  filter_data jsonb := COALESCE(p_training_filter, '{}');
  activity_filtered boolean;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  activity_filtered := private.training_filter_target_date(filter_data) IS NOT NULL
    OR NULLIF(filter_data->>'sourceId', '') IS NOT NULL
    OR NULLIF(trim(filter_data->>'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(filter_data->>'externalId'), '') IS NOT NULL;

  SELECT * INTO selected
  FROM private.training_scheduler_candidates_v2(
    p_user_id, p_card_type_ids, p_list_id, p_list_type,
    CASE WHEN p_card_filter = 'review' AND p_allow_practice THEN 'both'
         ELSE p_card_filter END,
    p_queue_turn, p_exclude_entry_ids, p_exclude_card_keys,
    filter_data, activity_filtered, true
  ) candidate
  WHERE (p_allow_practice OR candidate.queue_source <> 'practice')
    AND NOT (p_card_filter = 'review' AND p_allow_practice
      AND candidate.queue_source = 'new')
  ORDER BY candidate.selection_order
  LIMIT 1;

  IF selected.entry_id IS NOT NULL THEN
    RETURN NEXT private.project_training_scheduler_candidate_v1(
      p_user_id, selected.entry_id, selected.card_type_id, selected.queue_source,
      filter_data, activity_filtered, selected.new_today,
      selected.daily_new_limit, selected.new_pool_size,
      selected.learning_due_count, selected.review_pool_size
    );
  END IF;
END;
$$;

ALTER FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
