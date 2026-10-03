-- Explicit early reviews share card identity, ordinary FSRS and active-run
-- receipts. The session-only flag never broadens an ordinary review request.
BEGIN;
CREATE FUNCTION private.training_review_early_v1(p_filter jsonb,p_card_filter text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
  IF NOT COALESCE(p_filter,'{}'::jsonb) ? 'reviewTiming' THEN RETURN false; END IF;
  IF p_filter->>'reviewTiming' IS DISTINCT FROM 'early' OR p_card_filter IS DISTINCT FROM 'review' THEN
    RAISE EXCEPTION 'invalid_training_review_timing';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.training_review_early_v1(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION pg_temp.patch_early_review(p_signature text,p_before text,p_after text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p_signature::regprocedure) INTO definition;
 IF (length(definition)-length(replace(definition,p_before,'')))/length(p_before)<>1 THEN
   RAISE EXCEPTION 'early review migration unexpected baseline: %',p_signature;
 END IF;
 EXECUTE replace(definition,p_before,p_after);
END;
$$;
SELECT pg_temp.patch_early_review(
 'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
 $b$status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,$b$,
 $a$status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    (COALESCE(status.fsrs_reps,0)>0 OR status.last_reviewed_at IS NOT NULL) introduced,$a$);
SELECT pg_temp.patch_early_review(
 'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
 $b$    CASE
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1$b$,
 $a$    CASE
      WHEN private.training_review_early_v1(p_training_filter,p_card_filter)
        AND status.fsrs_enabled=true THEN
          CASE WHEN COALESCE(status.fsrs_last_interval,0)<1 THEN 'learning' ELSE 'review' END
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1$a$);
SELECT pg_temp.patch_early_review(
 'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
 $b$  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=reference_now)$b$,
 $a$  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=reference_now)
    AND (NOT private.training_review_early_v1(p_training_filter,p_card_filter)
      OR (cards.introduced AND cards.fsrs_enabled=true))$a$);
SELECT pg_temp.patch_early_review(
 'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
 $b$row_number() OVER (ORDER BY source_rank,$b$,
 $a$row_number() OVER (ORDER BY
    CASE WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN 0 ELSE source_rank END,
    CASE WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN next_review_at END,$a$);
SELECT pg_temp.patch_early_review(
 'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)',
 $b$    CASE
      WHEN p_filtered AND ($b$,
 $a$    CASE
      WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN intrinsic_source
      WHEN p_filtered AND ($a$);
SELECT pg_temp.patch_early_review(
 'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
 $b$  IF p_card_filter NOT IN ('new', 'review', 'both') THEN$b$,
 $a$  PERFORM private.training_review_early_v1(v_filter,p_card_filter);
  IF p_card_filter NOT IN ('new', 'review', 'both') THEN$a$);
-- The idiom target remains direction-specific and must already have an answer.
SELECT pg_temp.patch_early_review(
 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
 $b$    IF p_user_id IS NULL THEN$b$,
 $a$    PERFORM private.training_review_early_v1(p_training_filter,p_card_filter);
    IF p_user_id IS NULL THEN$a$);
SELECT pg_temp.patch_early_review(
 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
 $b$                state.fsrs_enabled,$b$,
 $a$                state.fsrs_enabled,
                (COALESCE(state.fsrs_reps,0)>0 OR state.last_reviewed_at IS NOT NULL) introduced,$a$);
SELECT pg_temp.patch_early_review(
 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
 $b$                    WHEN state.next_review_at <= private.training_reference_now_v1()
                         AND COALESCE(state.fsrs_last_interval, 0) < 1$b$,
 $a$                    WHEN private.training_review_early_v1(p_training_filter,p_card_filter)
                        THEN CASE WHEN COALESCE(state.fsrs_last_interval,0)<1 THEN 1 ELSE 2 END
                    WHEN state.next_review_at <= private.training_reference_now_v1()
                         AND COALESCE(state.fsrs_last_interval, 0) < 1$a$);
SELECT pg_temp.patch_early_review(
 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
 $b$             WHERE COALESCE(hidden, false) = false$b$,
 $a$             WHERE COALESCE(hidden, false) = false
               AND (NOT private.training_review_early_v1(p_training_filter,p_card_filter)
                 OR (introduced AND fsrs_enabled=true))$a$);
SELECT pg_temp.patch_early_review(
 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
 $b$ORDER BY queue_rank, next_review_at NULLS FIRST,
                                created_at, content_node_id$b$,
 $a$ORDER BY CASE WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN 0 ELSE queue_rank END,
                                next_review_at NULLS FIRST, created_at, content_node_id$a$);
SELECT pg_temp.patch_early_review(
 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
 $b$ORDER BY queue_rank, next_review_at NULLS FIRST, created_at, content_node_id$b$,
 $a$ORDER BY CASE WHEN private.training_review_early_v1(p_training_filter,p_card_filter) THEN 0 ELSE queue_rank END,
                  next_review_at NULLS FIRST, created_at, content_node_id$a$);
SELECT pg_temp.patch_early_review(
 'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
 $b$                WHEN v_candidate.next_review_at <= private.training_reference_now_v1()
                     AND COALESCE(v_candidate.fsrs_last_interval, 0) < 1$b$,
 $a$                WHEN private.training_review_early_v1(p_training_filter,p_card_filter)
                    THEN CASE WHEN COALESCE(v_candidate.fsrs_last_interval,0)<1 THEN 'learning' ELSE 'review' END
                WHEN v_candidate.next_review_at <= private.training_reference_now_v1()
                     AND COALESCE(v_candidate.fsrs_last_interval, 0) < 1$a$);
-- Sort a mixed-direction early run globally by due date, rather than alternating
-- directions ahead of the nearest review. Finite pools remain bounded by size.
SELECT pg_temp.patch_early_review(
 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
 $b$ORDER BY candidate.position, selected.direction_order$b$,
 $a$ORDER BY CASE WHEN private.training_review_early_v1(v_filter,p_card_filter)
                     THEN (candidate.item#>>'{state,nextReviewAt}')::timestamptz END,
                   candidate.position, selected.direction_order$a$);
SELECT pg_temp.patch_early_review(
 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
 $b$    IF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN$b$,
 $a$    PERFORM private.training_review_early_v1(v_filter,p_card_filter);
    IF v_size='all-due-today' AND private.training_review_early_v1(v_filter,p_card_filter) THEN
        v_requested_total := 2147483647;
    ELSIF v_size !~ '^[1-9][0-9]*$' OR length(v_size) > 9 THEN$a$);
SELECT pg_temp.patch_early_review(
 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
 $b$    v_requested_total := v_size::integer;$b$,
 $a$    IF v_size<>'all-due-today' THEN v_requested_total := v_size::integer; END IF;$a$);
SELECT pg_temp.patch_early_review(
 'private.start_platform_v2_idiom_training_session_v2(uuid,text,text,uuid,uuid,text,text,jsonb,integer)',
 $b$       SET planned_new = COALESCE(v_planned_new, 0),$b$,
 $a$       SET requested_total = CASE WHEN v_size='all-due-today' THEN COALESCE(v_planned_total,0) ELSE requested_total END,
           planned_new = COALESCE(v_planned_new, 0),$a$);
COMMIT;
