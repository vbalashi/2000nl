BEGIN READ ONLY;
DO $probe$
DECLARE
 writer regprocedure := 'public.record_training_active_time_v1(uuid,uuid,text,uuid,text,uuid,integer,timestamptz)'::regprocedure;
 reader regprocedure := 'public.get_training_active_time_v1(date,date,text)'::regprocedure;
 definition text;
 role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(role_name,'private.training_active_time_v1','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege(role_name,'private.training_active_time_coverage_v1','SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'active time direct table access'; END IF;
 END LOOP;
 IF NOT (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('private.training_active_time_v1'::regclass,'private.training_active_time_coverage_v1'::regclass)) THEN
  RAISE EXCEPTION 'active time RLS missing'; END IF;
 IF has_function_privilege('anon',writer,'EXECUTE') OR has_function_privilege('service_role',writer,'EXECUTE')
  OR has_function_privilege('anon',reader,'EXECUTE') OR has_function_privilege('service_role',reader,'EXECUTE')
  OR NOT has_function_privilege('authenticated',writer,'EXECUTE') OR NOT has_function_privilege('authenticated',reader,'EXECUTE') THEN
  RAISE EXCEPTION 'active time RPC grants'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE oid IN (writer,reader) AND prosecdef
  AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])<>2 THEN
  RAISE EXCEPTION 'active time RPC trust boundary'; END IF;
 definition := pg_get_functiondef(writer);
 IF strpos(definition,'auth.uid()')=0 OR strpos(definition,'pg_advisory_xact_lock')=0
  OR strpos(definition,'measurement_conflict')=0 OR strpos(definition,'30000')=0
  OR strpos(definition,'user_id=principal')=0 OR strpos(definition,'training_session_members')=0
  OR strpos(definition,'training_session_exercise_members')=0 OR strpos(definition,'t.family=CASE p_family')=0 THEN
  RAISE EXCEPTION 'active time identity/replay/member boundary'; END IF;
 definition := pg_get_functiondef(reader);
 IF strpos(definition,'auth.uid()')=0 OR strpos(definition,'private.training_user_timezone_v1(principal)')=0
  OR strpos(definition,'04:00')=0 OR strpos(definition,'t.user_id=principal')=0
  OR strpos(definition,'FILTER (WHERE t.measurement_id IS NOT NULL)')=0 OR strpos(definition,'coverageStartedAt')=0 THEN
  RAISE EXCEPTION 'active time study-day/empty/owner boundary'; END IF;
 IF (SELECT count(*) FROM private.training_active_time_coverage_v1 WHERE singleton AND isfinite(started_at))<>1 THEN
  RAISE EXCEPTION 'active time coverage start missing'; END IF;
END;
$probe$;
COMMIT;
