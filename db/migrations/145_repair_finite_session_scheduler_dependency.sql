-- Repair finite-session creation after migration 140 retired the private v1
-- candidate relation. Existing session membership and learner progress remain
-- unchanged; only future start_training_session calls use the canonical v2
-- scheduler relation.

BEGIN;

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
  v_filtered boolean;
  v_modes text[] := COALESCE(
    ARRAY(
      SELECT DISTINCT trim(mode)
      FROM unnest(COALESCE(p_card_type_ids, ARRAY['word-to-definition']::text[])) requested(mode)
      WHERE trim(mode) <> ''
      ORDER BY 1
    ),
    ARRAY['word-to-definition']::text[]
  );
  v_limit integer;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_session_size NOT IN ('5', '10', 'all-due-today') THEN
    RAISE EXCEPTION 'invalid training session size: %', p_session_size;
  END IF;
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN
    RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
  END IF;
  IF cardinality(v_modes) = 0 THEN
    v_modes := ARRAY['word-to-definition']::text[];
  END IF;

  v_filtered := private.training_filter_target_date(v_filter) IS NOT NULL
    OR NULLIF(v_filter->>'sourceId', '') IS NOT NULL
    OR NULLIF(trim(v_filter->>'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(v_filter->>'externalId'), '') IS NOT NULL;
  v_limit := CASE WHEN p_session_size = 'all-due-today' THEN NULL ELSE p_session_size::integer END;

  INSERT INTO public.training_sessions (
    id, user_id, session_size, card_type_ids, list_id, list_type,
    card_filter, training_filter
  ) VALUES (
    v_session_id, p_user_id, p_session_size, v_modes, p_list_id,
    COALESCE(p_list_type, 'curated'), p_card_filter, v_filter
  );

  WITH candidates AS MATERIALIZED (
    SELECT candidate.entry_id, candidate.card_type_id, candidate.queue_source,
           candidate.selection_order
    FROM private.training_scheduler_candidates_v2(
      p_user_id, v_modes, p_list_id, COALESCE(p_list_type, 'curated'),
      p_card_filter, 'auto', ARRAY[]::uuid[], ARRAY[]::text[], v_filter,
      v_filtered, false
    ) candidate
    WHERE candidate.queue_source IN ('new', 'learning', 'review')
    ORDER BY candidate.selection_order
    LIMIT v_limit
  )
  INSERT INTO public.training_session_members (
    session_id, ordinal, entry_id, card_type_id, queue_source
  )
  SELECT v_session_id,
         row_number() OVER (ORDER BY candidates.selection_order),
         candidates.entry_id, candidates.card_type_id, candidates.queue_source
  FROM candidates;

  UPDATE public.training_sessions session
  SET planned_new = counts.planned_new,
      planned_review = counts.planned_review,
      planned_practice = 0,
      planned_total = counts.planned_total
  FROM (
    SELECT count(*) FILTER (WHERE queue_source = 'new')::integer planned_new,
           count(*) FILTER (WHERE queue_source IN ('learning', 'review'))::integer planned_review,
           count(*)::integer planned_total
    FROM public.training_session_members member
    WHERE member.session_id = v_session_id
  ) counts
  WHERE session.id = v_session_id;

  RETURN (
    SELECT jsonb_build_object(
      'sessionId', session.id,
      'sessionSize', session.session_size,
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

COMMIT;
