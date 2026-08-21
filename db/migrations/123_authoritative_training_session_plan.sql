-- One scheduler-owned candidate relation for both selection and session totals.
BEGIN;

CREATE OR REPLACE FUNCTION private.training_scheduler_candidates_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_queue_turn text,
  p_exclude_entry_ids uuid[],
  p_exclude_card_keys text[],
  p_training_filter jsonb,
  p_filtered boolean
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
), filter_values AS (
  SELECT args.*,
    private.training_filter_target_date(filter_data) target_date,
    COALESCE(NULLIF(trim(filter_data->>'timezone'),''),'UTC') timezone,
    CASE WHEN NULLIF(filter_data->>'sourceId','') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (filter_data->>'sourceId')::uuid END source_id,
    NULLIF(trim(filter_data->>'sourceKind'),'') source_kind,
    NULLIF(trim(filter_data->>'externalId'),'') external_id
  FROM args
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
    AND log.reviewed_at::date=current_date
), scope AS (
  SELECT entry.id
  FROM word_entries entry, filter_values
  WHERE NOT private.is_pointer_only_dictionary_entry_v1(entry.raw)
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (entry.dictionary_id IS NULL OR can_access_dictionary(p_user_id,entry.dictionary_id,'read'))
    AND ((p_list_id IS NULL AND entry.is_nt2_2000=true)
      OR (p_list_id IS NOT NULL AND filter_values.list_type='curated' AND EXISTS (
        SELECT 1 FROM word_list_items item
        WHERE item.list_id=p_list_id AND item.word_id=entry.id
      ))
      OR (p_list_id IS NOT NULL AND filter_values.list_type='user' AND EXISTS (
        SELECT 1 FROM user_word_list_items item
        JOIN user_word_lists list ON list.id=item.list_id
        WHERE item.list_id=p_list_id AND item.word_id=entry.id AND list.user_id=p_user_id
      )))
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
), cards AS (
  SELECT scope.id entry_id,mode_order.card_type_id,status.fsrs_enabled,
    status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    status.entry_id IS NOT NULL has_status,matched.entry_id IS NOT NULL matches_filter,
    matched.latest_event_at,mode_order.mode_random,
    EXISTS (
      SELECT 1 FROM user_review_log new_log
      WHERE new_log.user_id=p_user_id AND new_log.word_id=scope.id
        AND new_log.mode=ANY(filter_values.modes)
        AND new_log.review_type='new' AND new_log.reviewed_at::date=current_date
    ) new_seen_today,
    EXISTS (
      SELECT 1 FROM user_review_log new_card_log
      WHERE new_card_log.user_id=p_user_id AND new_card_log.word_id=scope.id
        AND new_card_log.mode=mode_order.card_type_id
        AND new_card_log.review_type='new' AND new_card_log.reviewed_at::date=current_date
    ) new_card_seen_today,
    CASE
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1
        AND status.next_review_at<=now() THEN 'learning'
      WHEN status.fsrs_enabled=true AND status.fsrs_last_interval>=1
        AND status.next_review_at<=now() THEN 'review'
      WHEN status.entry_id IS NULL OR COALESCE(status.fsrs_enabled,false)=false THEN 'new'
      ELSE 'practice'
    END intrinsic_source
  FROM scope CROSS JOIN filter_values CROSS JOIN mode_order
  LEFT JOIN user_card_status status ON status.user_id=p_user_id
    AND status.entry_id=scope.id AND status.card_type_id=mode_order.card_type_id
  LEFT JOIN matched ON matched.entry_id=scope.id AND matched.card_type_id=mode_order.card_type_id
  WHERE NOT ((scope.id::text||':'||mode_order.card_type_id)=ANY(filter_values.excluded_cards))
    AND NOT EXISTS (
      SELECT 1 FROM user_card_known_marks known
      WHERE known.user_id=p_user_id AND known.entry_id=scope.id
        AND known.card_type_id=mode_order.card_type_id AND known.cleared_at IS NULL
    )
), eligible AS (
  SELECT cards.*
  FROM cards
  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=now())
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
      WHEN p_filtered THEN intrinsic_source
      WHEN intrinsic_source='learning' AND p_card_filter='both' THEN 'learning'
      WHEN intrinsic_source='review' AND p_card_filter<>'new'
        AND source_ordinal<=review_remaining THEN 'review'
      WHEN intrinsic_source='new' AND p_card_filter<>'review'
        AND ((new_seen_today AND NOT new_card_seen_today)
          OR new_word_ordinal<=new_remaining) THEN 'new'
      WHEN p_card_filter<>'both' OR NOT (
        COALESCE(daily.new_today,0)+LEAST(new_word_count,new_remaining)>=limits.new_limit
        AND COALESCE(daily.review_today,0)+LEAST(review_count,review_remaining)>=limits.review_limit
      ) THEN 'practice'
      ELSE NULL
    END queue_source
  FROM classified CROSS JOIN limits CROSS JOIN daily
), diagnostics AS (
  SELECT
    CASE WHEN p_filtered THEN
      count(*) FILTER (
        WHERE matches_filter AND has_status AND COALESCE(hidden,false)=false
          AND (frozen_until IS NULL OR frozen_until<=now())
          AND COALESCE(fsrs_enabled,false)=false
      )
    ELSE (
      SELECT count(*) FROM scope CROSS JOIN filter_values
      WHERE NOT EXISTS (
        SELECT 1 FROM user_card_status pool_status
        WHERE pool_status.user_id=p_user_id AND pool_status.entry_id=scope.id
          AND pool_status.card_type_id=ANY(filter_values.modes)
      )
    ) END new_pool_size,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=now())
        AND fsrs_enabled=true AND COALESCE(fsrs_last_interval,0)<1 AND next_review_at<=now()
    ) learning_due_count,
    count(*) FILTER (
      WHERE (NOT p_filtered OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=now())
        AND fsrs_enabled=true AND fsrs_last_interval>=1 AND next_review_at<=now()
    ) review_pool_size
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
  COALESCE(daily.new_today,0),limits.new_limit,diagnostics.new_pool_size,
  diagnostics.learning_due_count,LEAST(diagnostics.review_pool_size,10)
FROM ordered CROSS JOIN daily CROSS JOIN limits CROSS JOIN diagnostics;
$$;

REVOKE ALL ON FUNCTION private.training_scheduler_candidates_v1(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean
) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.project_training_scheduler_candidate_v1(
  p_user_id uuid,p_entry_id uuid,p_card_type_id text,p_queue_source text,
  p_training_filter jsonb,p_filtered boolean,p_new_today bigint,
  p_daily_new_limit bigint,p_new_pool_size bigint,p_learning_due_count bigint,
  p_review_pool_size bigint
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,private,pg_temp AS $$
SELECT jsonb_build_object(
  'id',entry.id,'dictionary_id',entry.dictionary_id,'language_code',entry.language_code,
  'headword',entry.headword,'part_of_speech',entry.part_of_speech,'gender',entry.gender,
  'raw',entry.raw,'vandaleId',entry.vandale_id,'is_nt2_2000',entry.is_nt2_2000,
  'meanings_count',(SELECT count(*) FROM word_entries sibling
    WHERE sibling.headword=entry.headword AND sibling.language_code=entry.language_code
      AND ((entry.dictionary_id IS NULL AND sibling.dictionary_id IS NULL)
        OR sibling.dictionary_id=entry.dictionary_id)),
  'mode',p_card_type_id,
  'stats',jsonb_build_object(
    'source',p_queue_source,'mode',p_card_type_id,'next_review',status.next_review_at,
    'interval',status.fsrs_last_interval,'reps',status.fsrs_reps,
    'stability',status.fsrs_stability,'difficulty',status.fsrs_difficulty,
    'clicks',status.click_count,'new_today',p_new_today,
    'daily_new_limit',p_daily_new_limit,'new_pool_size',p_new_pool_size,
    'learning_due_count',p_learning_due_count,'review_pool_size',p_review_pool_size,
    'reason',CASE WHEN p_filtered THEN 'filtered' ELSE p_queue_source END
  ) || CASE WHEN p_filtered
    THEN jsonb_build_object('training_filter',COALESCE(p_training_filter,'{}'))
    ELSE '{}'::jsonb END
)
FROM word_entries entry
LEFT JOIN user_card_status status ON status.user_id=p_user_id
  AND status.entry_id=entry.id AND status.card_type_id=p_card_type_id
WHERE entry.id=p_entry_id;
$$;
REVOKE ALL ON FUNCTION private.project_training_scheduler_candidate_v1(
  uuid,uuid,text,text,jsonb,boolean,bigint,bigint,bigint,bigint,bigint
)
FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_training_session_plan(
  p_user_id uuid,p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_list_id uuid DEFAULT NULL,p_list_type text DEFAULT 'curated',
  p_card_filter text DEFAULT 'both',p_training_filter jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,private,pg_temp AS $$
DECLARE filter_data jsonb:=COALESCE(p_training_filter,'{}'); filtered boolean; valid boolean:=true;
  planned_new int;planned_review int;planned_practice int;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user'; END IF;
  IF p_card_filter NOT IN ('new','review','both') THEN RAISE EXCEPTION 'invalid card filter: %',p_card_filter; END IF;
  IF p_list_id IS NOT NULL THEN
    IF COALESCE(p_list_type,'curated')='user' THEN
      SELECT EXISTS(SELECT 1 FROM user_word_lists l WHERE l.id=p_list_id AND l.user_id=p_user_id) INTO valid;
    ELSIF COALESCE(p_list_type,'curated')='curated' THEN
      SELECT EXISTS(SELECT 1 FROM word_lists l WHERE l.id=p_list_id) INTO valid;
    ELSE valid:=false; END IF;
  END IF;
  IF NOT valid THEN RETURN jsonb_build_object('plannedNew',0,'plannedReview',0,
    'plannedPractice',0,'plannedTotal',0,'plannedAt',clock_timestamp()); END IF;
  filtered:=private.training_filter_target_date(filter_data) IS NOT NULL
    OR NULLIF(filter_data->>'sourceId','') IS NOT NULL
    OR NULLIF(trim(filter_data->>'sourceKind'),'') IS NOT NULL
    OR NULLIF(trim(filter_data->>'externalId'),'') IS NOT NULL;
  SELECT count(*) FILTER(WHERE queue_source='new'),
    count(*) FILTER(WHERE queue_source IN ('learning','review')),
    count(*) FILTER(WHERE queue_source='practice')
  INTO planned_new,planned_review,planned_practice
  FROM private.training_scheduler_candidates_v1(p_user_id,p_card_type_ids,p_list_id,p_list_type,
    p_card_filter,'auto',ARRAY[]::uuid[],ARRAY[]::text[],filter_data,filtered);
  planned_new:=COALESCE(planned_new,0);planned_review:=COALESCE(planned_review,0);
  planned_practice:=COALESCE(planned_practice,0);
  RETURN jsonb_build_object('plannedNew',planned_new,'plannedReview',planned_review,
    'plannedPractice',planned_practice,'plannedTotal',planned_new+planned_review+planned_practice,
    'plannedAt',clock_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.get_next_card(
  p_user_id uuid,p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated',p_card_filter text DEFAULT 'both',
  p_queue_turn text DEFAULT 'auto',p_exclude_card_keys text[] DEFAULT ARRAY[]::text[]
) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,pg_temp AS $$
DECLARE selected record;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user'; END IF;
  SELECT * INTO selected FROM private.training_scheduler_candidates_v1(
    p_user_id,p_card_type_ids,p_list_id,p_list_type,p_card_filter,p_queue_turn,
    p_exclude_entry_ids,p_exclude_card_keys,'{}',false
  ) ORDER BY selection_order LIMIT 1;
  IF selected.entry_id IS NOT NULL THEN RETURN NEXT private.project_training_scheduler_candidate_v1(
    p_user_id,selected.entry_id,selected.card_type_id,selected.queue_source,'{}',false,
    selected.new_today,selected.daily_new_limit,selected.new_pool_size,
    selected.learning_due_count,selected.review_pool_size); END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_next_filtered_card(
  p_user_id uuid,p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated',p_card_filter text DEFAULT 'both',
  p_queue_turn text DEFAULT 'auto',p_exclude_card_keys text[] DEFAULT ARRAY[]::text[],
  p_training_filter jsonb DEFAULT '{}'
) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,private,pg_temp AS $$
DECLARE selected record;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user'; END IF;
  SELECT * INTO selected FROM private.training_scheduler_candidates_v1(
    p_user_id,p_card_type_ids,p_list_id,p_list_type,p_card_filter,p_queue_turn,
    p_exclude_entry_ids,p_exclude_card_keys,COALESCE(p_training_filter,'{}'),true
  ) ORDER BY selection_order LIMIT 1;
  IF selected.entry_id IS NOT NULL THEN RETURN NEXT private.project_training_scheduler_candidate_v1(
    p_user_id,selected.entry_id,selected.card_type_id,selected.queue_source,
    COALESCE(p_training_filter,'{}'),true,selected.new_today,selected.daily_new_limit,
    selected.new_pool_size,selected.learning_due_count,selected.review_pool_size); END IF;
END; $$;

REVOKE ALL ON FUNCTION public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb) TO authenticated;
COMMIT;
