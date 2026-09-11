-- Use one candidate implementation for direct selection and finite sessions.
-- Public direct-selection RPC signatures remain compatible, but their private
-- v1 dependency is removed: v2 is the only candidate eligibility function.

BEGIN;

-- Migration 137 retired these no-practice public overloads. Keep that removal
-- idempotent rather than allowing a later schema repair to revive them.
DROP FUNCTION IF EXISTS public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[]
);
DROP FUNCTION IF EXISTS public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb
);

-- Current direct selector. Direct selection still enforces its daily policy;
-- finite sessions call the same v2 body with that policy disabled.
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
  FROM private.training_scheduler_candidates_v2(
    p_user_id, p_card_type_ids, p_list_id, p_list_type, p_card_filter,
    p_queue_turn, p_exclude_entry_ids, p_exclude_card_keys, '{}', false, true
  ) candidate
  WHERE p_allow_practice OR candidate.queue_source <> 'practice'
  ORDER BY candidate.selection_order
  LIMIT 1;
  IF selected.entry_id IS NOT NULL THEN
    RETURN NEXT private.project_training_scheduler_candidate_v1(
      p_user_id, selected.entry_id, selected.card_type_id, selected.queue_source,
      '{}', false, selected.new_today, selected.daily_new_limit,
      selected.new_pool_size, selected.learning_due_count, selected.review_pool_size
    );
  END IF;
END;
$$;

-- The documented filtered review + allow-practice behavior requires v2 to
-- consider both sources, then removes only the newly admitted new candidates.
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
  FROM private.training_scheduler_candidates_v2(
    p_user_id, p_card_type_ids, p_list_id, p_list_type,
    CASE
      WHEN p_card_filter = 'review' AND p_allow_practice THEN 'both'
      ELSE p_card_filter
    END,
    p_queue_turn, p_exclude_entry_ids, p_exclude_card_keys,
    COALESCE(p_training_filter, '{}'), true, true
  ) candidate
  WHERE (p_allow_practice OR candidate.queue_source <> 'practice')
    AND NOT (
      p_card_filter = 'review'
      AND p_allow_practice
      AND candidate.queue_source = 'new'
    )
  ORDER BY candidate.selection_order
  LIMIT 1;
  IF selected.entry_id IS NOT NULL THEN
    RETURN NEXT private.project_training_scheduler_candidate_v1(
      p_user_id, selected.entry_id, selected.card_type_id, selected.queue_source,
      COALESCE(p_training_filter, '{}'), true, selected.new_today,
      selected.daily_new_limit, selected.new_pool_size,
      selected.learning_due_count, selected.review_pool_size
    );
  END IF;
END;
$$;

-- The retained six-argument planning endpoint shares the same direct daily
-- policy without retaining a private v1 scheduler relation.
CREATE OR REPLACE FUNCTION public.get_training_session_plan(
  p_user_id uuid,
  p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
  p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated',
  p_card_filter text DEFAULT 'both',
  p_training_filter jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  filter_data jsonb := COALESCE(p_training_filter, '{}');
  filtered boolean;
  valid boolean := true;
  planned_new bigint;
  planned_review bigint;
  planned_practice bigint;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN
    RAISE EXCEPTION 'invalid card filter: %', p_card_filter;
  END IF;
  IF p_list_id IS NOT NULL THEN
    IF COALESCE(p_list_type, 'curated') = 'user' THEN
      SELECT EXISTS(
        SELECT 1 FROM user_word_lists list
        WHERE list.id = p_list_id AND list.user_id = p_user_id
      ) INTO valid;
    ELSIF COALESCE(p_list_type, 'curated') = 'curated' THEN
      SELECT EXISTS(SELECT 1 FROM word_lists list WHERE list.id = p_list_id) INTO valid;
    ELSE
      valid := false;
    END IF;
  END IF;
  IF NOT valid THEN
    RETURN jsonb_build_object(
      'plannedNew', 0, 'plannedReview', 0, 'plannedPractice', 0,
      'plannedTotal', 0, 'plannedAt', clock_timestamp()
    );
  END IF;
  filtered := private.training_filter_target_date(filter_data) IS NOT NULL
    OR NULLIF(filter_data ->> 'sourceId', '') IS NOT NULL
    OR NULLIF(trim(filter_data ->> 'sourceKind'), '') IS NOT NULL
    OR NULLIF(trim(filter_data ->> 'externalId'), '') IS NOT NULL;

  IF p_list_id IS NULL AND NOT filtered THEN
    SELECT counts.planned_new, counts.planned_review, counts.planned_practice
    INTO planned_new, planned_review, planned_practice
    FROM private.default_training_session_plan_counts_v1(
      p_user_id, p_card_type_ids, p_list_type, p_card_filter, filter_data
    ) counts;
  ELSE
    SELECT count(*) FILTER (WHERE queue_source = 'new'),
      count(*) FILTER (WHERE queue_source IN ('learning', 'review')),
      count(*) FILTER (WHERE queue_source = 'practice')
    INTO planned_new, planned_review, planned_practice
    FROM private.training_scheduler_candidates_v2(
      p_user_id, p_card_type_ids, p_list_id, p_list_type,
      p_card_filter, 'auto', ARRAY[]::uuid[], ARRAY[]::text[], filter_data,
      filtered, true
    );
  END IF;

  planned_new := COALESCE(planned_new, 0);
  planned_review := COALESCE(planned_review, 0);
  planned_practice := COALESCE(planned_practice, 0);
  RETURN jsonb_build_object(
    'plannedNew', planned_new,
    'plannedReview', planned_review,
    'plannedPractice', planned_practice,
    'plannedTotal', planned_new + planned_review + planned_practice,
    'plannedAt', clock_timestamp()
  );
END;
$$;

ALTER FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],boolean
) OWNER TO postgres;
ALTER FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) OWNER TO postgres;
ALTER FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_next_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_filtered_card(
  uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_training_session_plan(
  uuid,text[],uuid,text,text,jsonb
) TO authenticated;

DROP FUNCTION IF EXISTS private.training_scheduler_candidates_v1(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean
);
DROP FUNCTION IF EXISTS private.training_scheduler_candidates_v1(
  uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean
);

COMMIT;
