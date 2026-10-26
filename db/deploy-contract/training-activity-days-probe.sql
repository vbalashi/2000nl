BEGIN READ ONLY;
DO $probe$
DECLARE
 reader regprocedure := 'public.get_training_activity_days_v1(text,integer)'::regprocedure;
 definition text;
BEGIN
 IF has_function_privilege('anon',reader,'EXECUTE') OR has_function_privilege('service_role',reader,'EXECUTE')
  OR NOT has_function_privilege('authenticated',reader,'EXECUTE') THEN
  RAISE EXCEPTION 'activity days RPC grants'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE oid=reader AND prosecdef AND provolatile='s'
  AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])<>1 THEN
  RAISE EXCEPTION 'activity days trust boundary'; END IF;
 definition := pg_get_functiondef(reader);
 IF strpos(definition,'auth.uid()')=0 OR strpos(definition,'private.training_user_timezone_v1(principal)')=0
  OR strpos(definition,'e.user_id=principal')=0 OR strpos(definition,'r.user_id=principal')=0
  OR strpos(definition,'earlier.user_id=principal')=0 OR strpos(definition,'public.get_training_active_time_v1(v_first,v_today,p_language_code)')=0
  OR strpos(definition,'BETWEEN 1 AND 366')=0 OR strpos(definition,'04:00')=0 THEN
  RAISE EXCEPTION 'activity days owner/range/time boundary'; END IF;
 IF definition ~* '\m(insert|update|delete)\M' THEN
  RAISE EXCEPTION 'activity days must stay read-only'; END IF;
END;
$probe$;
COMMIT;
