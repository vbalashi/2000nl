\i db/deploy-contract/read-only-postflight-217.sql
DO $probe$
BEGIN
 IF NOT has_function_privilege('authenticated','public.get_meaning_learning_progress_v1(uuid)','EXECUTE') OR has_function_privilege('anon','public.get_meaning_learning_progress_v1(uuid)','EXECUTE') THEN RAISE EXCEPTION 'invalid progress read grants'; END IF;
 IF has_function_privilege('authenticated','public.resume_meaning_learning_as_principal_v1(uuid,uuid,text,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.resume_meaning_learning_as_principal_v1(uuid,uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'invalid meaning resume grants'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='private.meaning_resume_events'::regclass) THEN RAISE EXCEPTION 'resume receipts must retain RLS'; END IF;
END;
$probe$;
