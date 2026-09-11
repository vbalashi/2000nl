-- A Training session is a requested number of completed exercises, not a
-- daily allowance. Keep legacy scheduler callers on v1 and put the one
-- session-specific policy switch in its own server-owned candidate seam.

BEGIN;

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
  WHERE p_list_id IS NULL
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
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
), today_new_words AS MATERIALIZED (
  SELECT DISTINCT log.word_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at::date=current_date
), today_new_cards AS MATERIALIZED (
  SELECT DISTINCT log.word_id,log.mode AS card_type_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=p_user_id
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at::date=current_date
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
), cards AS (
  SELECT scope.id entry_id,mode_order.card_type_id,status.fsrs_enabled,
    status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    status.entry_id IS NOT NULL has_status,matched.entry_id IS NOT NULL matches_filter,
    matched.latest_event_at,mode_order.mode_random,
    today_new_words.word_id IS NOT NULL new_seen_today,
    today_new_cards.word_id IS NOT NULL new_card_seen_today,
    CASE
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1
        AND status.next_review_at<=now() THEN 'learning'
      WHEN status.fsrs_enabled=true AND status.fsrs_last_interval>=1
        AND status.next_review_at<=now() THEN 'review'
      WHEN status.entry_id IS NULL OR COALESCE(status.fsrs_enabled,false)=false THEN 'new'
      ELSE 'practice'
    END intrinsic_source
  FROM scope CROSS JOIN filter_values CROSS JOIN mode_order
  LEFT JOIN learner_status status ON status.entry_id=scope.id
    AND status.card_type_id=mode_order.card_type_id
  LEFT JOIN matched ON matched.entry_id=scope.id AND matched.card_type_id=mode_order.card_type_id
  LEFT JOIN today_new_words ON today_new_words.word_id=scope.id
  LEFT JOIN today_new_cards ON today_new_cards.word_id=scope.id
    AND today_new_cards.card_type_id=mode_order.card_type_id
  LEFT JOIN known_cards ON known_cards.entry_id=scope.id
    AND known_cards.card_type_id=mode_order.card_type_id
  WHERE NOT ((scope.id::text||':'||mode_order.card_type_id)=ANY(filter_values.excluded_cards))
    AND known_cards.entry_id IS NULL
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
      WHEN p_filtered AND (
        p_card_filter = 'both'
        OR (p_card_filter = 'new' AND intrinsic_source = 'new')
        OR (p_card_filter = 'review' AND intrinsic_source IN ('learning', 'review'))
      ) THEN intrinsic_source
      WHEN p_filtered THEN NULL
      WHEN intrinsic_source='learning' AND p_card_filter='both' THEN 'learning'
      WHEN intrinsic_source='review' AND p_card_filter<>'new'
        AND (NOT p_enforce_daily_limits OR source_ordinal<=review_remaining) THEN 'review'
      WHEN intrinsic_source='new' AND p_card_filter<>'review'
        AND (NOT p_enforce_daily_limits OR (new_seen_today AND NOT new_card_seen_today)
          OR new_word_ordinal<=new_remaining) THEN 'new'
      WHEN p_card_filter<>'both' OR NOT (
        p_enforce_daily_limits
        AND COALESCE(daily.new_today,0)+LEAST(new_word_count,new_remaining)>=limits.new_limit
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
      SELECT count(*)
      FROM scope
      LEFT JOIN (SELECT DISTINCT entry_id FROM learner_status) pool_status
        ON pool_status.entry_id=scope.id
      WHERE pool_status.entry_id IS NULL
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

ALTER FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_scheduler_candidates_v2(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) FROM PUBLIC, anon, authenticated, service_role;

-- One shared ordering function is used for both preview and latching. It
-- emits only immediate new/due material and represents ratio as a soft
-- preference: either category fills a missing preferred category.
CREATE OR REPLACE FUNCTION private.training_session_members_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text
)
RETURNS TABLE(
  entry_id uuid,
  card_type_id text,
  queue_source text,
  session_ordinal integer
)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
WITH RECURSIVE requested AS (
  SELECT CASE WHEN p_session_size = 'all-due-today' THEN NULL
              ELSE p_session_size::integer END AS requested_total
), candidates AS MATERIALIZED (
  SELECT candidate.entry_id,
    candidate.card_type_id,
    candidate.queue_source,
    candidate.selection_order,
    CASE WHEN candidate.queue_source = 'new' THEN 'new' ELSE 'review' END AS category
  FROM private.training_scheduler_candidates_v2(
    p_user_id, p_card_type_ids, p_list_id, COALESCE(p_list_type, 'curated'),
    p_card_filter, 'auto', ARRAY[]::uuid[], ARRAY[]::text[],
    COALESCE(p_training_filter, '{}'::jsonb),
    private.training_filter_target_date(COALESCE(p_training_filter, '{}'::jsonb)) IS NOT NULL
      OR NULLIF(COALESCE(p_training_filter, '{}'::jsonb)->>'sourceId', '') IS NOT NULL
      OR NULLIF(trim(COALESCE(p_training_filter, '{}'::jsonb)->>'sourceKind'), '') IS NOT NULL
      OR NULLIF(trim(COALESCE(p_training_filter, '{}'::jsonb)->>'externalId'), '') IS NOT NULL,
    false
  ) candidate
  WHERE candidate.queue_source IN ('new', 'learning', 'review')
), ranked AS MATERIALIZED (
  SELECT candidates.*,
    row_number() OVER (
      PARTITION BY category ORDER BY selection_order
    )::integer AS category_rank
  FROM candidates
), policy AS MATERIALIZED (
  SELECT
    count(*) FILTER (WHERE category = 'new')::integer AS available_new,
    count(*) FILTER (WHERE category = 'review')::integer AS available_review,
    LEAST(5, GREATEST(1, COALESCE(settings.new_review_ratio, 2)))::integer AS ratio,
    COALESCE(
      requested.requested_total,
      count(*) FILTER (WHERE category IN ('new', 'review'))::integer
    ) AS target_total
  FROM ranked
  CROSS JOIN requested
  LEFT JOIN user_settings settings ON settings.user_id = p_user_id
  GROUP BY requested.requested_total, settings.new_review_ratio
), sequence(
  session_ordinal, phase, new_taken, review_taken, category, category_rank
) AS (
  SELECT
    1,
    1,
    CASE WHEN choice.category = 'new' THEN 1 ELSE 0 END,
    CASE WHEN choice.category = 'review' THEN 1 ELSE 0 END,
    choice.category,
    1
  FROM policy
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN policy.available_new > 0 THEN 'new'
      WHEN policy.available_review > 0 THEN 'review'
    END AS category
  ) choice
  WHERE policy.target_total > 0
    AND choice.category IS NOT NULL

  UNION ALL

  SELECT
    sequence.session_ordinal + 1,
    CASE
      WHEN choice.category = 'new' THEN 1
      WHEN sequence.phase >= policy.ratio THEN 0
      ELSE sequence.phase + 1
    END,
    sequence.new_taken + CASE WHEN choice.category = 'new' THEN 1 ELSE 0 END,
    sequence.review_taken + CASE WHEN choice.category = 'review' THEN 1 ELSE 0 END,
    choice.category,
    CASE WHEN choice.category = 'new'
      THEN sequence.new_taken + 1
      ELSE sequence.review_taken + 1
    END
  FROM sequence
  CROSS JOIN policy
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN sequence.phase = 0 AND sequence.new_taken < policy.available_new THEN 'new'
      WHEN sequence.phase = 0 AND sequence.review_taken < policy.available_review THEN 'review'
      WHEN sequence.phase > 0 AND sequence.review_taken < policy.available_review THEN 'review'
      WHEN sequence.phase > 0 AND sequence.new_taken < policy.available_new THEN 'new'
    END AS category
  ) choice
  WHERE sequence.session_ordinal < policy.target_total
    AND choice.category IS NOT NULL
)
SELECT ranked.entry_id,
  ranked.card_type_id,
  ranked.queue_source,
  sequence.session_ordinal
FROM sequence
JOIN ranked
  ON ranked.category = sequence.category
 AND ranked.category_rank = sequence.category_rank
ORDER BY sequence.session_ordinal;
$$;

ALTER FUNCTION private.training_session_members_v1(
  uuid,text[],uuid,text,text,jsonb,text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_session_members_v1(
  uuid,text[],uuid,text,text,jsonb,text
) FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS requested_total integer NOT NULL DEFAULT 0;
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS completion_reason text;
ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS exhausted_at timestamptz;

UPDATE public.training_sessions
SET requested_total = planned_total
WHERE requested_total = 0
  AND session_size <> 'all-due-today';

ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_session_size_check;
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_session_size_check
  CHECK (session_size = 'all-due-today' OR session_size ~ '^[1-9][0-9]*$');
ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_requested_total_check;
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_requested_total_check CHECK (requested_total >= 0);
ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_completion_reason_check;
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_completion_reason_check
  CHECK (completion_reason IS NULL OR completion_reason IN ('completed', 'exhausted'));

CREATE OR REPLACE FUNCTION public.get_training_session_plan(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_size text := COALESCE(NULLIF(trim(p_session_size), ''), '10');
  v_requested_total integer;
  v_planned_new integer;
  v_planned_review integer;
  v_planned_total integer;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN
    RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
  END IF;
  IF v_size = 'all-due-today' THEN
    v_requested_total := NULL;
  ELSIF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN
    RAISE EXCEPTION 'invalid training session size: %', v_size;
  ELSE
    v_requested_total := v_size::integer;
  END IF;

  SELECT count(*) FILTER (WHERE queue_source = 'new')::integer,
    count(*) FILTER (WHERE queue_source IN ('learning', 'review'))::integer,
    count(*)::integer
  INTO v_planned_new, v_planned_review, v_planned_total
  FROM private.training_session_members_v1(
    p_user_id, p_card_type_ids, p_list_id, p_list_type,
    p_card_filter, COALESCE(p_training_filter, '{}'::jsonb), v_size
  );

  v_planned_new := COALESCE(v_planned_new, 0);
  v_planned_review := COALESCE(v_planned_review, 0);
  v_planned_total := COALESCE(v_planned_total, 0);
  RETURN jsonb_build_object(
    'requestedTotal', COALESCE(v_requested_total, v_planned_total),
    'plannedNew', v_planned_new,
    'plannedReview', v_planned_review,
    'plannedPractice', 0,
    'plannedTotal', v_planned_total,
    'plannedAt', clock_timestamp()
  );
END;
$$;

ALTER FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb,text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb,text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_training_session(
  p_user_id uuid,
  p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated',
  p_card_filter text DEFAULT 'both',
  p_training_filter jsonb DEFAULT '{}',
  p_session_size text DEFAULT '10'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_session_id uuid := gen_random_uuid();
  v_filter jsonb := COALESCE(p_training_filter, '{}'::jsonb);
  v_modes text[] := COALESCE(
    ARRAY(
      SELECT DISTINCT trim(mode)
      FROM unnest(COALESCE(p_card_type_ids, ARRAY['word-to-definition']::text[])) requested(mode)
      WHERE trim(mode) <> ''
      ORDER BY 1
    ), ARRAY['word-to-definition']::text[]
  );
  v_size text := COALESCE(NULLIF(trim(p_session_size), ''), '10');
  v_requested_total integer;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN
    RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
  END IF;
  IF v_size = 'all-due-today' THEN
    v_requested_total := NULL;
  ELSIF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN
    RAISE EXCEPTION 'invalid training session size: %', v_size;
  ELSE
    v_requested_total := v_size::integer;
  END IF;

  INSERT INTO public.training_sessions (
    id, user_id, session_size, card_type_ids, list_id, list_type,
    card_filter, training_filter, requested_total
  ) VALUES (
    v_session_id, p_user_id, v_size, v_modes, p_list_id,
    COALESCE(p_list_type, 'curated'), p_card_filter, v_filter,
    COALESCE(v_requested_total, 0)
  );

  INSERT INTO public.training_session_members (
    session_id, ordinal, entry_id, card_type_id, queue_source
  )
  SELECT v_session_id, member.session_ordinal,
    member.entry_id, member.card_type_id, member.queue_source
  FROM private.training_session_members_v1(
    p_user_id, v_modes, p_list_id, COALESCE(p_list_type, 'curated'),
    p_card_filter, v_filter, v_size
  ) member;

  UPDATE public.training_sessions session
  SET planned_new = counts.planned_new,
      planned_review = counts.planned_review,
      planned_practice = 0,
      planned_total = counts.planned_total,
      requested_total = COALESCE(v_requested_total, counts.planned_total),
      completed_at = CASE WHEN counts.planned_total = 0 THEN now() ELSE NULL END,
      exhausted_at = CASE WHEN counts.planned_total = 0 THEN now() ELSE NULL END,
      completion_reason = CASE WHEN counts.planned_total = 0 THEN 'exhausted' ELSE NULL END
  FROM (
    SELECT count(*) FILTER (WHERE queue_source = 'new')::integer AS planned_new,
      count(*) FILTER (WHERE queue_source IN ('learning', 'review'))::integer AS planned_review,
      count(*)::integer AS planned_total
    FROM public.training_session_members member
    WHERE member.session_id = v_session_id
  ) counts
  WHERE session.id = v_session_id;

  RETURN (
    SELECT jsonb_build_object(
      'sessionId', session.id,
      'sessionSize', session.session_size,
      'requestedTotal', session.requested_total,
      'plannedNew', session.planned_new,
      'plannedReview', session.planned_review,
      'plannedPractice', session.planned_practice,
      'plannedTotal', session.planned_total,
      'plannedAt', session.created_at
    )
    FROM public.training_sessions session
    WHERE session.id = v_session_id
  );
END;
$$;

ALTER FUNCTION public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_training_session_snapshot(
  p_user_id uuid,
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_session public.training_sessions%rowtype;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  SELECT * INTO v_session
  FROM public.training_sessions
  WHERE id = p_session_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'sessionSize', v_session.session_size,
    'requestedTotal', v_session.requested_total,
    'plannedNew', v_session.planned_new,
    'plannedReview', v_session.planned_review,
    'plannedPractice', v_session.planned_practice,
    'plannedTotal', v_session.planned_total,
    'completedActions', COALESCE((
      SELECT count(*)::integer
      FROM public.training_session_members member
      WHERE member.session_id = v_session.id AND member.consumed_at IS NOT NULL
    ), 0),
    'completionReason', v_session.completion_reason,
    'plannedAt', v_session.created_at,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ordinal', member.ordinal,
        'entryId', member.entry_id,
        'cardTypeId', member.card_type_id,
        'queueSource', member.queue_source,
        'consumedAt', member.consumed_at,
        'unavailableAt', member.unavailable_at,
        'unavailableReason', member.unavailable_reason
      ) ORDER BY member.ordinal)
      FROM public.training_session_members member
      WHERE member.session_id = v_session.id
    ), '[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION public.get_training_session_snapshot(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_session_snapshot(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_training_session_snapshot(uuid,uuid)
  TO authenticated;

-- Accepted actions, rather than member attempts, decide completion. This
-- preserves the action-receipt boundary from migration 134 while making
-- exhaustion explicit when an initially small or later-invalid pool cannot
-- reach the requested budget.
CREATE OR REPLACE FUNCTION private.consume_training_session_member(
  p_user_id uuid,
  p_session_id uuid,
  p_entry_id uuid,
  p_card_type_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_member public.training_session_members%rowtype;
  v_expected_member public.training_session_members%rowtype;
  v_requested_total integer;
  v_completed_at timestamptz;
  v_remaining integer;
  v_completed_actions integer;
  v_status text;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  SELECT session.requested_total, session.completed_at
  INTO v_requested_total, v_completed_at
  FROM public.training_sessions session
  WHERE session.id = p_session_id AND session.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;

  SELECT member.* INTO v_member
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id
    AND member.entry_id = p_entry_id
    AND member.card_type_id = p_card_type_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;
  IF v_member.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'duplicate', 'ordinal', v_member.ordinal);
  END IF;
  IF v_member.unavailable_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'unavailable', 'ordinal', v_member.ordinal);
  END IF;
  IF v_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'completed', 'ordinal', v_member.ordinal);
  END IF;

  SELECT member.* INTO v_expected_member
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id
    AND member.consumed_at IS NULL
    AND member.unavailable_at IS NULL
  ORDER BY member.ordinal
  LIMIT 1;
  IF NOT FOUND
     OR v_expected_member.entry_id IS DISTINCT FROM v_member.entry_id
     OR v_expected_member.card_type_id IS DISTINCT FROM v_member.card_type_id THEN
    RETURN jsonb_build_object(
      'status', 'out-of-order',
      'ordinal', v_member.ordinal,
      'expectedOrdinal', v_expected_member.ordinal
    );
  END IF;

  UPDATE public.training_session_members
  SET consumed_at = now()
  WHERE session_id = v_member.session_id
    AND entry_id = v_member.entry_id
    AND card_type_id = v_member.card_type_id;

  SELECT (count(*) FILTER (WHERE member.consumed_at IS NULL AND member.unavailable_at IS NULL))::integer,
    (count(*) FILTER (WHERE member.consumed_at IS NOT NULL))::integer
  INTO v_remaining, v_completed_actions
  FROM public.training_session_members member
  WHERE member.session_id = v_member.session_id;

  IF v_completed_actions >= v_requested_total THEN
    UPDATE public.training_sessions
    SET completed_at = COALESCE(completed_at, now()),
        completion_reason = COALESCE(completion_reason, 'completed')
    WHERE id = v_member.session_id;
    v_status := 'consumed-complete';
  ELSIF v_remaining = 0 THEN
    UPDATE public.training_sessions
    SET completed_at = COALESCE(completed_at, now()),
        exhausted_at = COALESCE(exhausted_at, now()),
        completion_reason = COALESCE(completion_reason, 'exhausted')
    WHERE id = v_member.session_id;
    -- The caller accepts the same terminal completion status for a normal
    -- budget finish and for an exhausted pool; the persisted reason tells
    -- the UI which completion screen to show.
    v_status := 'consumed-complete';
  ELSE
    v_status := 'consumed';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'ordinal', v_member.ordinal,
    'remaining', v_remaining,
    'completedActions', v_completed_actions,
    'requestedTotal', v_requested_total
  );
END;
$$;

ALTER FUNCTION private.consume_training_session_member(uuid,uuid,uuid,text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION private.consume_training_session_member(uuid,uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;

-- The evidence check remains in migration 136's private function. This public
-- adapter only reconciles a successfully retired member with the current
-- eligible pool under the same session lock. A replacement gets a fresh,
-- immutable membership identity and never counts as a completed exercise.
CREATE OR REPLACE FUNCTION public.mark_training_session_member_unavailable(
  p_user_id uuid,
  p_session_id uuid,
  p_entry_id uuid,
  p_card_type_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_session public.training_sessions%rowtype;
  v_replacement record;
  v_card_keys text[];
  v_ratio integer;
  v_completed_actions integer;
  v_queue_turn text;
  v_filtered boolean;
  v_next_ordinal integer;
  v_remaining integer;
  v_was_unavailable boolean := false;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  -- Match the action-consumption lock order: session before member. The
  -- private evidence check takes the same locks, so a retry cannot deadlock
  -- with an accepted action for this session.
  PERFORM 1
  FROM public.training_sessions session
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
  FOR UPDATE;

  SELECT member.unavailable_at IS NOT NULL INTO v_was_unavailable
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id
    AND member.entry_id = p_entry_id
    AND member.card_type_id = p_card_type_id
  FOR UPDATE;

  v_result := private.mark_training_session_member_unavailable(
    p_user_id, p_session_id, p_entry_id, p_card_type_id, p_reason
  );
  IF v_result->>'status' NOT IN ('unavailable', 'unavailable-complete') THEN
    RETURN v_result;
  END IF;
  IF v_was_unavailable THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_session
  FROM public.training_sessions session
  WHERE session.id = p_session_id AND session.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not-member'); END IF;

  SELECT count(*)::integer INTO v_completed_actions
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id AND member.consumed_at IS NOT NULL;
  SELECT LEAST(5, GREATEST(1, COALESCE(settings.new_review_ratio, 2)))
    INTO v_ratio
  FROM user_settings settings
  WHERE settings.user_id = p_user_id;
  v_ratio := COALESCE(v_ratio, 2);
  v_queue_turn := CASE
    WHEN v_session.card_filter <> 'both' THEN 'auto'
    WHEN mod(v_completed_actions, v_ratio + 1) = 0 THEN 'new'
    ELSE 'review'
  END;
  SELECT COALESCE(array_agg(member.entry_id::text || ':' || member.card_type_id), ARRAY[]::text[])
    INTO v_card_keys
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id;
  v_filtered := private.training_filter_target_date(v_session.training_filter) IS NOT NULL
    OR NULLIF(v_session.training_filter->>'sourceId', '') IS NOT NULL
    OR NULLIF(trim(v_session.training_filter->>'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(v_session.training_filter->>'externalId'), '') IS NOT NULL;

  SELECT candidate.* INTO v_replacement
  FROM private.training_scheduler_candidates_v2(
    p_user_id, v_session.card_type_ids, v_session.list_id, v_session.list_type,
    v_session.card_filter, v_queue_turn, ARRAY[]::uuid[], v_card_keys,
    v_session.training_filter, v_filtered, false
  ) candidate
  WHERE candidate.queue_source IN ('new', 'learning', 'review')
  ORDER BY candidate.selection_order
  LIMIT 1;

  IF FOUND AND v_completed_actions < v_session.requested_total THEN
    SELECT COALESCE(max(member.ordinal), 0) + 1 INTO v_next_ordinal
    FROM public.training_session_members member
    WHERE member.session_id = p_session_id;
    INSERT INTO public.training_session_members (
      session_id, ordinal, entry_id, card_type_id, queue_source
    ) VALUES (
      p_session_id, v_next_ordinal, v_replacement.entry_id,
      v_replacement.card_type_id, v_replacement.queue_source
    );
    UPDATE public.training_sessions
    SET completed_at = NULL, exhausted_at = NULL, completion_reason = NULL
    WHERE id = p_session_id;
    RETURN jsonb_build_object(
      'status', 'unavailable-replaced',
      'ordinal', v_result->'ordinal',
      'reason', p_reason,
      'replacementOrdinal', v_next_ordinal
    );
  END IF;

  SELECT count(*)::integer INTO v_remaining
  FROM public.training_session_members member
  WHERE member.session_id = p_session_id
    AND member.consumed_at IS NULL
    AND member.unavailable_at IS NULL;
  IF v_remaining = 0 THEN
    UPDATE public.training_sessions
    SET completed_at = COALESCE(completed_at, now()),
        exhausted_at = COALESCE(exhausted_at, now()),
        completion_reason = COALESCE(completion_reason, 'exhausted')
    WHERE id = p_session_id;
    RETURN jsonb_build_object(
      'status', 'unavailable-exhausted',
      'ordinal', v_result->'ordinal',
      'reason', p_reason,
      'remaining', 0
    );
  END IF;
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)
  TO authenticated;

COMMIT;
