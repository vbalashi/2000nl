\i db/deploy-contract/read-only-postflight-223.sql
DO $parts$
DECLARE f pg_proc;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.dictionary_translation_job_parts'::regclass AND relrowsecurity)
 OR has_table_privilege('anon','public.dictionary_translation_job_parts','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated','public.dictionary_translation_job_parts','SELECT,INSERT,UPDATE,DELETE')
 OR EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.dictionary_translation_job_parts'::regclass AND a.grantee=0)
 OR NOT has_table_privilege('service_role','public.dictionary_translation_job_parts','SELECT,INSERT,UPDATE')
 THEN RAISE EXCEPTION 'translation parts security mismatch'; END IF;
 SELECT * INTO STRICT f FROM pg_proc WHERE oid='public.checkpoint_dictionary_translation_part_v1(uuid,uuid,text,text,jsonb,boolean)'::regprocedure;
 IF f.prosecdef OR NOT COALESCE('search_path=public, pg_temp'=ANY(f.proconfig),false)
 OR has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE')
 OR NOT has_function_privilege('service_role',f.oid,'EXECUTE')
 OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'translation parts function security mismatch'; END IF;
 IF position('source_row_revision' IN pg_get_functiondef(f.oid))=0 OR position('lease_expires_at' IN pg_get_functiondef(f.oid))=0
 THEN RAISE EXCEPTION 'translation parts fencing missing'; END IF;
END $parts$;
