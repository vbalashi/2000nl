BEGIN READ ONLY;
DO $pair_exclusion_actions$
DECLARE
 action_oid regprocedure := 'public.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid)'::regprocedure;
 legacy_oid regprocedure := 'private.perform_legacy_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid)'::regprocedure;
 action_body text := pg_get_functiondef(legacy_oid);
 wrapper_body text := pg_get_functiondef(action_oid);
BEGIN
 -- All former168 storage, original consumption, authority and no-grade checks
 -- still apply to the preserved owner; the wrapper adds receipt-preserving Known.
 IF to_regclass('private.training_pair_exclusions_active_idx') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.training_pair_exclusions'::regclass AND relrowsecurity)
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.training_pair_exclusion_events'::regclass AND relrowsecurity)
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=legacy_oid AND prosecdef AND proconfig @> ARRAY['search_path=public, private, extensions, pg_temp'])
  OR action_body NOT ILIKE '%require_active_training_session_v1%'
  OR action_body NOT ILIKE '%consume_training_session_member%'
  OR action_body NOT ILIKE '%consume_platform_v2_training_exercise_session_member_v1%'
  OR action_body NOT ILIKE '%can_access_dictionary%'
  OR action_body NOT ILIKE '%exclusion_idempotency_conflict%'
  OR action_body NOT ILIKE '%stale_exclusion_mark%'
  OR action_body ILIKE '%UPDATE public.user_card_status%'
  OR action_body ILIKE '%UPDATE public.user_training_exercise_state%'
  OR wrapper_body ILIKE '%UPDATE public.user_card_status%'
  OR wrapper_body ILIKE '%UPDATE public.user_training_exercise_state%'
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=action_oid AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, private, extensions, pg_temp'])
  OR wrapper_body NOT ILIKE '%private.perform_legacy_pair_exclusion_as_principal_v1%'
  OR wrapper_body NOT ILIKE '%private.convert_ordinary_pair_to_known_v1%'
  OR wrapper_body NOT ILIKE '%exclusion_idempotency_conflict%'
  OR wrapper_body NOT ILIKE '%private.entry_access_v1%'
  OR NOT has_function_privilege('service_role',action_oid,'EXECUTE')
  OR has_function_privilege('authenticated',action_oid,'EXECUTE')
  OR has_function_privilege('anon',action_oid,'EXECUTE')
  OR has_function_privilege('service_role',legacy_oid,'EXECUTE')
  OR has_function_privilege('authenticated',legacy_oid,'EXECUTE')
  OR has_function_privilege('anon',legacy_oid,'EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: postflight-failed pair-exclusion-actions';
 END IF;
END; $pair_exclusion_actions$;
COMMIT;
