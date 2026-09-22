-- Per-session new/review rhythm for finite ordinary training sessions.
-- Existing public signatures and their global-setting behavior remain intact.
-- A nullable latch distinguishes pre-existing sessions from explicit-ratio runs.
BEGIN;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS new_review_ratio integer;
ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_new_review_ratio_check;
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_new_review_ratio_check
  CHECK (new_review_ratio IS NULL OR new_review_ratio BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION private.training_session_members_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_new_review_ratio integer
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
    p_new_review_ratio AS ratio,
    COALESCE(
      requested.requested_total,
      count(*) FILTER (WHERE category IN ('new', 'review'))::integer
    ) AS target_total
  FROM ranked
  CROSS JOIN requested
  GROUP BY requested.requested_total
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
  uuid,text[],uuid,text,text,jsonb,text,integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_session_members_v1(
  uuid,text[],uuid,text,text,jsonb,text,integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_training_session_plan(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_new_review_ratio integer
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
  IF p_card_filter = 'both' AND (
    p_new_review_ratio IS NULL OR p_new_review_ratio NOT BETWEEN 1 AND 5
  ) THEN
    RAISE EXCEPTION 'invalid new/review ratio: %', p_new_review_ratio;
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
    p_card_filter, COALESCE(p_training_filter, '{}'::jsonb), v_size,
    CASE WHEN p_card_filter = 'both' THEN p_new_review_ratio ELSE 2 END
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
  uuid,text[],uuid,text,text,jsonb,text,integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb,text,integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb,text,integer
) TO authenticated;

CREATE OR REPLACE FUNCTION private.start_training_session_latch_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_new_review_ratio integer
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
  IF p_card_filter = 'both' AND (
    p_new_review_ratio IS NULL OR p_new_review_ratio NOT BETWEEN 1 AND 5
  ) THEN
    RAISE EXCEPTION 'invalid new/review ratio: %', p_new_review_ratio;
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
    card_filter, training_filter, requested_total, new_review_ratio
  ) VALUES (
    v_session_id, p_user_id, v_size, v_modes, p_list_id,
    COALESCE(p_list_type, 'curated'), p_card_filter, v_filter,
    COALESCE(v_requested_total, 0),
    CASE WHEN p_card_filter = 'both' THEN p_new_review_ratio ELSE 2 END
  );

  INSERT INTO public.training_session_members (
    session_id, ordinal, entry_id, card_type_id, queue_source
  )
  SELECT v_session_id, member.session_ordinal,
    member.entry_id, member.card_type_id, member.queue_source
  FROM private.training_session_members_v1(
    p_user_id, v_modes, p_list_id, COALESCE(p_list_type, 'curated'),
    p_card_filter, v_filter, v_size,
    CASE WHEN p_card_filter = 'both' THEN p_new_review_ratio ELSE 2 END
  ) member;

  UPDATE public.training_sessions session
  SET planned_new = counts.planned_new,
      planned_review = counts.planned_review,
      planned_practice = 0,
      planned_total = counts.planned_total,
      requested_total = COALESCE(v_requested_total, counts.planned_total),
      completed_at = CASE WHEN counts.planned_total = 0 THEN private.training_reference_now_v1() ELSE NULL END,
      exhausted_at = CASE WHEN counts.planned_total = 0 THEN private.training_reference_now_v1() ELSE NULL END,
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
ALTER FUNCTION private.start_training_session_latch_v1(
  uuid,text[],uuid,text,text,jsonb,text,integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.start_training_session_latch_v1(
  uuid,text[],uuid,text,text,jsonb,text,integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.claim_training_session_start_v1(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_request_id uuid,
  p_new_review_ratio integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
  v_request_hash text;
  v_receipt public.training_run_start_receipts%rowtype;
  v_latched jsonb;
  v_session_id uuid;
  v_previous_session_id uuid;
  v_generation bigint;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'missing_training_run_start_request_id';
  END IF;

  IF p_card_filter = 'both' AND (
    p_new_review_ratio IS NULL OR p_new_review_ratio NOT BETWEEN 1 AND 5
  ) THEN
    RAISE EXCEPTION 'invalid new/review ratio: %', p_new_review_ratio;
  END IF;

  v_request_hash := encode(digest(jsonb_build_object(
    'modes', COALESCE(p_card_type_ids, ARRAY[]::text[]),
    'listId', p_list_id,
    'listType', p_list_type,
    'filter', p_card_filter,
    'trainingFilter', COALESCE(p_training_filter, '{}'::jsonb),
    'size', p_session_size,
    'newReviewRatio', CASE WHEN p_card_filter = 'both' THEN p_new_review_ratio ELSE 2 END
  )::text, 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:' || p_user_id::text));
  SELECT * INTO v_receipt
  FROM public.training_run_start_receipts
  WHERE user_id = p_user_id AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'training_run_start_idempotency_conflict';
    END IF;
    RETURN private.training_session_run_response_v1(p_user_id, v_receipt.session_id);
  END IF;

  v_latched := private.start_training_session_latch_v1(
    p_user_id, p_card_type_ids, p_list_id, p_list_type, p_card_filter,
    p_training_filter, p_session_size,
    CASE WHEN p_card_filter = 'both' THEN p_new_review_ratio ELSE 2 END
  );
  v_session_id := (v_latched->>'sessionId')::uuid;

  SELECT session_id, generation INTO v_previous_session_id, v_generation
  FROM public.training_active_runs
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_previous_session_id IS DISTINCT FROM v_session_id THEN
    -- The insert trigger normally claims the queue. This fallback only
    -- protects a manually repaired/legacy row that has no trigger state.
    INSERT INTO public.training_active_runs (user_id, session_id, generation, updated_at)
    VALUES (p_user_id, v_session_id, COALESCE(v_generation, 0) + 1, now())
    ON CONFLICT (user_id) DO UPDATE
    SET session_id = EXCLUDED.session_id,
        generation = public.training_active_runs.generation + 1,
        updated_at = EXCLUDED.updated_at;
  END IF;

  INSERT INTO public.training_run_start_receipts (
    user_id, request_id, request_hash, session_id
  ) VALUES (
    p_user_id, p_request_id, v_request_hash, v_session_id
  );

  RETURN private.training_session_run_response_v1(p_user_id, v_session_id);
END;
$$;
ALTER FUNCTION private.claim_training_session_start_v1(
  uuid,text[],uuid,text,text,jsonb,text,uuid,integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.claim_training_session_start_v1(
  uuid,text[],uuid,text,text,jsonb,text,uuid,integer
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_training_session(
  p_user_id uuid,
  p_card_type_ids text[],
  p_list_id uuid,
  p_list_type text,
  p_card_filter text,
  p_training_filter jsonb,
  p_session_size text,
  p_request_id uuid,
  p_new_review_ratio integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.claim_training_session_start_v1(
    p_user_id, p_card_type_ids, p_list_id, p_list_type, p_card_filter,
    p_training_filter, p_session_size, p_request_id, p_new_review_ratio
  );
$$;
ALTER FUNCTION public.start_training_session(
  uuid,text[],uuid,text,text,jsonb,text,uuid,integer
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_training_session(
  uuid,text[],uuid,text,text,jsonb,text,uuid,integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_training_session(
  uuid,text[],uuid,text,text,jsonb,text,uuid,integer
) TO authenticated;

CREATE OR REPLACE FUNCTION private.mark_training_session_member_unavailable_latch_v1(
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
  -- Explicit sessions retain their original rhythm even if preferences change.
  -- Pre-existing sessions have no latch and keep their historical fallback.
  SELECT COALESCE(
    v_session.new_review_ratio,
    LEAST(5, GREATEST(1, settings.new_review_ratio)),
    2
  ) INTO v_ratio
  FROM (SELECT 1) seed
  LEFT JOIN user_settings settings ON settings.user_id = p_user_id;
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
    SET completed_at = COALESCE(completed_at, private.training_reference_now_v1()),
        exhausted_at = COALESCE(exhausted_at, private.training_reference_now_v1()),
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
ALTER FUNCTION private.mark_training_session_member_unavailable_latch_v1(
  uuid,uuid,uuid,text,text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.mark_training_session_member_unavailable_latch_v1(
  uuid,uuid,uuid,text,text
) FROM PUBLIC, anon, authenticated, service_role;

-- A newly added named RPC argument must be visible to PostgREST after commit.
NOTIFY pgrst, 'reload schema';

COMMIT;
