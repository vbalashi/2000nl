BEGIN READ ONLY;
DO $probe$
DECLARE writer regprocedure := 'public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid)'::regprocedure;
BEGIN
 IF has_function_privilege('anon',writer,'EXECUTE') OR has_function_privilege('authenticated',writer,'EXECUTE')
  OR NOT has_function_privilege('service_role',writer,'EXECUTE') THEN RAISE EXCEPTION 'headword exclusion grants'; END IF;
 IF has_table_privilege('authenticated','private.training_headword_exclusions','SELECT')
  OR has_table_privilege('service_role','private.training_headword_exclusion_events','INSERT') THEN RAISE EXCEPTION 'headword exclusion table boundary'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('private.training_headword_exclusions'::regclass,
  'private.training_headword_exclusion_events'::regclass) AND relrowsecurity)<>2 THEN RAISE EXCEPTION 'headword exclusion RLS'; END IF;
 IF strpos(pg_get_functiondef('private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure),
  'private.training_headword_exclusions')=0 THEN RAISE EXCEPTION 'headword scheduler boundary'; END IF;
 IF strpos(pg_get_functiondef('private.require_training_pair_available_v1(uuid,text,uuid,uuid,text,text)'::regprocedure),
  'training-headword:')=0 THEN RAISE EXCEPTION 'headword review lock boundary'; END IF;
END;
$probe$;
COMMIT;
