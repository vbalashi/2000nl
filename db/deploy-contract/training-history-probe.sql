BEGIN READ ONLY;
DO $probe$
DECLARE reader regprocedure := 'public.get_recent_training_activity_v1(integer)'::regprocedure; body text;
BEGIN
 IF has_function_privilege('anon',reader,'EXECUTE') OR has_function_privilege('service_role',reader,'EXECUTE')
  OR NOT has_function_privilege('authenticated',reader,'EXECUTE') THEN RAISE EXCEPTION 'history grants'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE oid=reader AND prosecdef AND provolatile='s'
  AND proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'])<>1 THEN RAISE EXCEPTION 'history trust boundary'; END IF;
 body := pg_get_functiondef(reader);
 IF strpos(body,'auth.uid()')=0 OR strpos(body,'e.user_id = v_user_id')=0
  OR strpos(body,'rl.user_id = v_user_id')=0 OR strpos(body,'can_access_dictionary(v_user_id, w.dictionary_id, ''read'')')=0
  OR strpos(body,'user_training_exercise_action_events')=0 OR strpos(body,'source_text_fingerprint = t.source_text_fingerprint')=0
  OR strpos(body,'24 hours')>0 THEN RAISE EXCEPTION 'history owner/access/window boundary'; END IF;
 IF body ~* '\m(insert|update|delete)\M' THEN RAISE EXCEPTION 'history must stay read-only'; END IF;
 IF to_regprocedure('public.get_recent_training_review_history(integer)') IS NULL THEN RAISE EXCEPTION 'legacy history missing'; END IF;
END;
$probe$;
COMMIT;
