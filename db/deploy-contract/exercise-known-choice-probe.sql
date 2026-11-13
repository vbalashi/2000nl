BEGIN READ ONLY;
DO $probe$
DECLARE save_oid regprocedure:='public.set_training_exercise_choice_as_principal_v1(uuid,uuid,uuid,text[],text,uuid)'::regprocedure;
 read_oid regprocedure:='public.get_training_exercise_choice_v1(uuid)'::regprocedure;
 restore_oid regprocedure:='public.restore_training_exercise_mark_v1(uuid,uuid)'::regprocedure;
 body text:=pg_get_functiondef(save_oid);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.training_exercise_choice_events'::regclass AND relrowsecurity)
 OR NOT has_function_privilege('service_role',save_oid,'EXECUTE') OR has_function_privilege('authenticated',save_oid,'EXECUTE') OR has_function_privilege('anon',save_oid,'EXECUTE')
 OR NOT has_function_privilege('authenticated',read_oid,'EXECUTE') OR has_function_privilege('anon',read_oid,'EXECUTE')
 OR NOT has_function_privilege('authenticated',restore_oid,'EXECUTE') OR has_function_privilege('anon',restore_oid,'EXECUTE')
 OR body NOT ILIKE '%consume_platform_v2_training_exercise_session_member_v1%'
 OR body NOT ILIKE '%set_training_exercise_known_v1%'
 OR body ILIKE '%update public.user_card_status%' OR body ILIKE '%update public.user_training_exercise_state%' THEN
  RAISE EXCEPTION 'db-contract-gate: exercise-known-choice';
 END IF;
END; $probe$;
COMMIT;
