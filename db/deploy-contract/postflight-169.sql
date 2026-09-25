\i db/deploy-contract/postflight-168.sql
BEGIN;
DO $pair_availability$
DECLARE check_row record; definition text;
BEGIN
  FOR check_row IN SELECT * FROM (VALUES
    ('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)','training_pair_exclusions'),
    ('private.platform_v2_idiom_exercise_candidates_v1(uuid,text,integer,integer)','training_pair_exclusions'),
    ('private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)','training_pair_exclusions'),
    ('private.platform_v2_translation_exercise_candidates_v1(uuid,integer,integer)','training_pair_exclusions'),
    ('public.read_training_idiom_stats_v1(uuid)','AND NOT excluded'),
    ('private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)','require_training_pair_available_v1'),
    ('private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)','require_training_pair_available_v1'),
    ('private.perform_platform_v2_translation_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)','require_training_pair_available_v1'),
    ('public.handle_card_review(uuid,uuid,text,text,uuid)','require_training_pair_available_v1'),
    ('public.read_platform_v2_idiom_training_session_next(uuid,uuid)','pair-excluded'),
    ('public.mark_platform_v2_idiom_training_session_member_unavailable(uuid,uuid,uuid,text)','pair-excluded'),
    ('public.read_platform_v2_translation_training_session_next(uuid,uuid)','pair-excluded'),
    ('public.mark_platform_v2_translation_session_member_unavailable(uuid,uuid,uuid,text)','pair-excluded'),
    ('private.get_next_training_session_card_latch_v1(uuid,uuid,text[])','pair-excluded'),
    ('private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)','pair-excluded')
    ,('private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)','training_pair_exclusions')
  ) checks(signature,marker) LOOP
    SELECT pg_get_functiondef(check_row.signature::regprocedure) INTO definition;
    IF strpos(definition,check_row.marker)=0 THEN
      RAISE EXCEPTION 'db-contract-gate: postflight-failed pair-exclusion %',check_row.signature;
    END IF;
  END LOOP;
END
$pair_availability$;
COMMIT;
