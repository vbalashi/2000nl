\i db/deploy-contract/postflight-167.sql
BEGIN;
DO $pair_exclusion_actions$
DECLARE
  action_oid oid := 'public.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid)'::regprocedure;
  action_body text;
BEGIN
  SELECT pg_get_functiondef(action_oid) INTO action_body;
  IF to_regclass('private.training_pair_exclusions_active_idx') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='private.training_pair_exclusions'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='private.training_pair_exclusion_events'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=action_oid AND prosecdef
        AND proconfig @> ARRAY['search_path=public, private, extensions, pg_temp'])
    OR action_body NOT ILIKE '%require_active_training_session_v1%'
    OR action_body NOT ILIKE '%consume_training_session_member%'
    OR action_body NOT ILIKE '%consume_platform_v2_training_exercise_session_member_v1%'
    OR action_body NOT ILIKE '%can_access_dictionary%'
    OR action_body NOT ILIKE '%exclusion_idempotency_conflict%'
    OR action_body NOT ILIKE '%stale_exclusion_mark%'
    OR action_body ILIKE '%UPDATE public.user_card_status%'
    OR action_body ILIKE '%UPDATE public.user_training_exercise_state%'
    OR NOT has_function_privilege('service_role',action_oid,'execute')
    OR has_function_privilege('authenticated',action_oid,'execute')
    OR has_function_privilege('anon',action_oid,'execute') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed pair-exclusion-actions';
  END IF;
END
$pair_exclusion_actions$;
COMMIT;
