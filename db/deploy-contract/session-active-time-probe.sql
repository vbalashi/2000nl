DO $$ BEGIN
 IF to_regprocedure('public.get_training_session_active_time_v1(uuid)') IS NULL
 OR to_regclass('private.training_active_time_user_session_idx') IS NULL
 OR NOT has_function_privilege('authenticated','public.get_training_session_active_time_v1(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.get_training_session_active_time_v1(uuid)','EXECUTE')
 OR has_function_privilege('service_role','public.get_training_session_active_time_v1(uuid)','EXECUTE')
 OR has_table_privilege('authenticated','private.training_active_time_v1','SELECT') THEN
 RAISE EXCEPTION 'Session attention contract or privileges differ'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.get_training_session_active_time_v1(uuid)'::regprocedure AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp']) THEN
 RAISE EXCEPTION 'Session attention search path differs'; END IF;
END $$;
