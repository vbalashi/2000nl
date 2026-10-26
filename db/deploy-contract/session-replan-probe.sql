DO $$ BEGIN
 IF to_regclass('private.training_session_replan_history') IS NULL
 OR to_regprocedure('private.replan_training_session_remainder_v1(uuid,uuid)') IS NULL
 OR has_table_privilege('authenticated','private.training_session_replan_history','SELECT')
 OR has_table_privilege('service_role','private.training_session_replan_history','INSERT')
 OR has_function_privilege('authenticated','private.replan_training_session_remainder_v1(uuid,uuid)','EXECUTE')
 OR has_function_privilege('service_role','private.replan_training_session_remainder_v1(uuid,uuid)','EXECUTE') THEN
 RAISE EXCEPTION 'External session replan private boundary differs'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.get_training_session_snapshot(uuid,uuid)'::regprocedure AND provolatile='v' AND prosecdef AND prosrc LIKE '%replan_training_session_remainder_v1%')
 OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.get_next_training_session_card(uuid,uuid,text[])'::regprocedure AND provolatile='v' AND prosrc LIKE '%replan_training_session_remainder_v1%') THEN
 RAISE EXCEPTION 'Snapshot/next-card reconciliation differs'; END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_sessions' AND column_name='external_state_revision' AND data_type='bigint' AND is_nullable='NO')
 OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_sessions' AND column_name='planned_state_revision' AND data_type='bigint' AND is_nullable='NO') THEN
 RAISE EXCEPTION 'Session revision columns differ'; END IF;
END $$;
