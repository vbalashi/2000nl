-- Give Training an explicit finite session-size contract without changing FSRS.
-- The old signatures remain available for older clients; the new overloads are
-- used by the current UI and make practice-card inclusion explicit.

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
  p_filtered boolean,
  p_allow_practice boolean
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
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT candidate.entry_id,
    candidate.card_type_id,
    candidate.queue_source,
    candidate.selection_order,
    candidate.new_today,
    candidate.daily_new_limit,
    candidate.new_pool_size,
    candidate.learning_due_count,
    candidate.review_pool_size
  FROM private.training_scheduler_candidates_v1(
    p_user_id,
    p_card_type_ids,
    p_list_id,
    p_list_type,
    p_card_filter,
    p_queue_turn,
    p_exclude_entry_ids,
    p_exclude_card_keys,
    p_training_filter,
    p_filtered
  ) candidate
  WHERE p_allow_practice OR candidate.queue_source <> 'practice';
$$;

ALTER FUNCTION private.training_scheduler_candidates_v1(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.training_scheduler_candidates_v1(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
) FROM PUBLIC, anon, authenticated, service_role;

-- Current UI selector with an explicit practice-card switch. The original
-- eight-argument overload remains unchanged for older clients.
CREATE OR REPLACE FUNCTION public.get_next_card(
  p_user_id uuid,
  p_card_type_ids text[],
  p_exclude_entry_ids uuid[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_queue_turn text,
  p_exclude_card_keys text[],
  p_allow_practice boolean
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  selected record;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  SELECT * INTO selected
  FROM private.training_scheduler_candidates_v1(
    p_user_id,
    p_card_type_ids,
    p_list_id,
    p_list_type,
    p_card_filter,
    p_queue_turn,
    p_exclude_entry_ids,
    p_exclude_card_keys,
    '{}',
    false,
    p_allow_practice
  )
  ORDER BY selection_order
  LIMIT 1;
  IF selected.entry_id IS NOT NULL THEN
    RETURN NEXT private.project_training_scheduler_candidate_v1(
      p_user_id,
      selected.entry_id,
      selected.card_type_id,
      selected.queue_source,
      '{}',
      false,
      selected.new_today,
      selected.daily_new_limit,
      selected.new_pool_size,
      selected.learning_due_count,
      selected.review_pool_size
    );
  END IF;
END;
$$;

ALTER FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],boolean
) TO authenticated;

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
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  SELECT * INTO selected
  FROM private.training_scheduler_candidates_v1(
    p_user_id,
    p_card_type_ids,
    p_list_id,
    p_list_type,
    p_card_filter,
    p_queue_turn,
    p_exclude_entry_ids,
    p_exclude_card_keys,
    COALESCE(p_training_filter, '{}'),
    true,
    p_allow_practice
  )
  ORDER BY selection_order
  LIMIT 1;
  IF selected.entry_id IS NOT NULL THEN
    RETURN NEXT private.project_training_scheduler_candidate_v1(
      p_user_id,
      selected.entry_id,
      selected.card_type_id,
      selected.queue_source,
      COALESCE(p_training_filter, '{}'),
      true,
      selected.new_today,
      selected.daily_new_limit,
      selected.new_pool_size,
      selected.learning_due_count,
      selected.review_pool_size
    );
  END IF;
END;
$$;

ALTER FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) TO authenticated;

-- The plan overload bounds the existing authoritative counts. A finite plan
-- and all-due-today plan intentionally exclude future practice cards.
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
  raw_plan jsonb;
  planned_new bigint;
  planned_review bigint;
  planned_practice bigint;
  remaining bigint;
  session_size text := COALESCE(NULLIF(trim(p_session_size), ''), '10');
  planned_at jsonb;
BEGIN
  IF session_size NOT IN ('5', '10', 'all-due-today') THEN
    RAISE EXCEPTION 'invalid training session size: %', session_size;
  END IF;

  raw_plan := public.get_training_session_plan(
    p_user_id,
    p_card_type_ids,
    p_list_id,
    p_list_type,
    p_card_filter,
    p_training_filter
  );
  planned_new := COALESCE((raw_plan ->> 'plannedNew')::bigint, 0);
  planned_review := COALESCE((raw_plan ->> 'plannedReview')::bigint, 0);
  planned_practice := COALESCE((raw_plan ->> 'plannedPractice')::bigint, 0);
  planned_at := COALESCE(raw_plan -> 'plannedAt', to_jsonb(clock_timestamp()));

  IF session_size = 'all-due-today' THEN
    planned_practice := 0;
  ELSE
    remaining := session_size::bigint;
    planned_new := LEAST(planned_new, remaining);
    remaining := GREATEST(remaining - planned_new, 0);
    planned_review := LEAST(planned_review, remaining);
    remaining := GREATEST(remaining - planned_review, 0);
    planned_practice := 0;
  END IF;

  RETURN jsonb_build_object(
    'plannedNew', planned_new,
    'plannedReview', planned_review,
    'plannedPractice', planned_practice,
    'plannedTotal', planned_new + planned_review + planned_practice,
    'plannedAt', planned_at
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

COMMIT;
