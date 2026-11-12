BEGIN READ ONLY;
DO $known_choice$
DECLARE writer regprocedure := 'public.set_training_known_directions_as_principal_v1(uuid,uuid,uuid,text,text[],text,uuid)'::regprocedure;
 converter regprocedure := 'public.convert_meaning_exclusions_to_known_as_principal_v1(integer)'::regprocedure;
BEGIN
 IF has_function_privilege('anon',writer,'EXECUTE') OR has_function_privilege('authenticated',writer,'EXECUTE') OR NOT has_function_privilege('service_role',writer,'EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: Known choice writer grants'; END IF;
 IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, private, extensions, pg_temp'] FROM pg_proc WHERE oid=writer) THEN
  RAISE EXCEPTION 'db-contract-gate: Known choice trusted boundary'; END IF;
 IF strpos(pg_get_functiondef(writer),'meaning_progress_conflict')=0 OR strpos(pg_get_functiondef(writer),'consume_training_session_member')=0
  OR strpos(pg_get_functiondef(writer),'known_choice_idempotency_conflict')=0 THEN RAISE EXCEPTION 'db-contract-gate: Known choice atomic/retry boundary'; END IF;
 IF strpos(pg_get_functiondef(writer),'original_external_revision')=0
  OR strpos(pg_get_functiondef(writer),'remaining_members')=0
  OR strpos(pg_get_functiondef(writer),$$unavailable_reason='known'$$)=0 THEN
  RAISE EXCEPTION 'db-contract-gate: Known choice must preserve the frozen plan'; END IF;
 IF strpos(pg_get_functiondef('public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid)'::regprocedure),'private.entry_access_v1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: converted legacy undo must check live entry access'; END IF;
 IF has_function_privilege('anon',converter,'EXECUTE') OR has_function_privilege('authenticated',converter,'EXECUTE') OR has_function_privilege('service_role',converter,'EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: historical conversion is operator-only'; END IF;
 IF has_function_privilege('service_role','private.perform_legacy_meaning_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: legacy writer bypass exposed'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('private.training_known_choice_events'::regclass,'private.meaning_exclusion_known_conversions'::regclass) AND relrowsecurity)<>2 THEN
  RAISE EXCEPTION 'db-contract-gate: Known choice event/mapping RLS'; END IF;
 IF has_table_privilege('authenticated','private.training_known_choice_events','SELECT') OR has_table_privilege('service_role','private.meaning_exclusion_known_conversions','UPDATE') THEN
  RAISE EXCEPTION 'db-contract-gate: Known choice event/mapping privileges'; END IF;
 IF has_function_privilege('service_role','private.perform_legacy_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid)','EXECUTE')
  OR has_function_privilege('service_role','private.convert_ordinary_pair_to_known_v1(uuid)','EXECUTE')
  OR has_table_privilege('service_role','private.ordinary_pair_known_conversions','UPDATE') THEN RAISE EXCEPTION 'db-contract-gate: pair conversion owner exposed'; END IF;
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='private.ordinary_pair_known_conversions'::regclass) THEN RAISE EXCEPTION 'db-contract-gate: pair conversion RLS'; END IF;
 IF EXISTS(SELECT 1 FROM private.training_headword_exclusions WHERE restored_at IS NULL)
  OR EXISTS(SELECT 1 FROM private.training_pair_exclusions WHERE restored_at IS NULL) THEN
  RAISE EXCEPTION 'db-contract-gate: ordinary exclusion transfer incomplete'; END IF;
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='private.training_exercise_known_marks'::regclass)
  OR has_table_privilege('authenticated','private.training_exercise_known_marks','SELECT')
  OR has_table_privilege('service_role','private.training_exercise_known_marks','UPDATE')
  OR has_function_privilege('service_role','private.set_training_exercise_known_v1(uuid,uuid,boolean,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.get_training_exercise_known_state_v1(uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.get_training_exercise_known_state_v1(uuid)','EXECUTE')
  OR has_function_privilege('anon','public.get_training_exercise_known_choices_v1(uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.get_training_exercise_known_choices_v1(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: content Known authority boundary'; END IF;
END; $known_choice$;
COMMIT;
