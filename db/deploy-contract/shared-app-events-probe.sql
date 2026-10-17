DO $probe$
DECLARE signatures text[] := ARRAY['private.send_app_event_v1(text,text,text,text,text)',
  'private.broadcast_app_row_v1()', 'private.can_receive_app_event_v1(text)']; signature text; expected text; actual integer;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='realtime.messages'::regclass) THEN
    RAISE EXCEPTION 'Realtime messages must retain RLS'; END IF;
  FOREACH signature IN ARRAY signatures LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=signature::regprocedure AND prosecdef AND proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Unrestricted app event helper: %',signature; END IF;
    IF has_function_privilege('anon',signature,'EXECUTE') THEN RAISE EXCEPTION 'Anonymous app event helper: %',signature; END IF;
  END LOOP;
  IF has_function_privilege('authenticated','private.send_app_event_v1(text,text,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.publish_app_release_v1(text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.publish_app_release_v1(text)','EXECUTE') THEN
    RAISE EXCEPTION 'App event publishers must remain server-only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='realtime.messages'::regclass AND polname='app_events_receive_v1' AND polcmd='r')
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='realtime.messages'::regclass AND polname='app_events_guard_read_v1' AND NOT polpermissive)
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='realtime.messages'::regclass AND polname='app_events_guard_write_v1' AND NOT polpermissive) THEN
    RAISE EXCEPTION 'Missing private app event authorization'; END IF;
  FOREACH expected IN ARRAY ARRAY['app_events_translation','app_events_translation_job','app_events_training_run',
    'app_events_training_session','app_events_account','app_events_learning','app_events_exercise_learning',
    'app_events_pair_exclusion','app_events_meaning_exclusion','app_events_meaning_resume','app_events_collection','app_events_collection_items'] LOOP
    SELECT count(*) INTO actual FROM pg_trigger WHERE tgname=expected AND NOT tgisinternal AND tgenabled='O'
      AND tgfoid='private.broadcast_app_row_v1()'::regprocedure;
    IF actual <> 1 THEN RAISE EXCEPTION 'Missing app event producer %',expected; END IF;
  END LOOP;
END $probe$;
