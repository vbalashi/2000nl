\i db/deploy-contract/read-only-postflight-222.sql
DO $translation_jobs_contract$
DECLARE f pg_proc; signature text; definition text; privilege text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.dictionary_translation_jobs'::regclass AND relrowsecurity)
 THEN RAISE EXCEPTION 'translation queue RLS missing'; END IF;
 IF has_table_privilege('anon','public.dictionary_translation_jobs','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated','public.dictionary_translation_jobs','SELECT,INSERT,UPDATE,DELETE')
 OR EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
 WHERE c.oid='public.dictionary_translation_jobs'::regclass AND a.grantee=0)

 THEN RAISE EXCEPTION 'translation queue privileges changed'; END IF;
 FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
  IF NOT has_table_privilege('service_role','public.dictionary_translation_jobs',privilege)
  THEN RAISE EXCEPTION 'translation worker missing table privilege: %',privilege; END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'public.dictionary_translation_source_v1(uuid)',
  'public.enqueue_dictionary_translation_job_v1(uuid,text,text,text,text,text,text,integer,boolean,boolean,timestamptz)',
  'public.claim_dictionary_translation_job_v1()',
  'public.heartbeat_dictionary_translation_job_v1(uuid,uuid)',
  'public.fail_dictionary_translation_job_v1(uuid,uuid,text,boolean)',
  'public.complete_dictionary_translation_job_v1(uuid,uuid,jsonb,text)'
 ] LOOP
  SELECT * INTO STRICT f FROM pg_proc WHERE oid=signature::regprocedure;
  IF f.prosecdef OR NOT COALESCE('search_path=public, pg_temp'=ANY(f.proconfig), false)
  OR has_function_privilege('anon',f.oid,'EXECUTE')
  OR has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR NOT has_function_privilege('service_role',f.oid,'EXECUTE')
  OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'translation queue function security changed: %',signature; END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.dictionary_translation_jobs'::regclass
 AND conname='dictionary_translation_job_identity' AND contype='u')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.dictionary_translation_jobs'::regclass
 AND conname='dictionary_translation_job_lease' AND contype='c')
 OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid='public.dictionary_translation_jobs_active_identity_idx'::regclass AND indisunique AND indisvalid)
 THEN RAISE EXCEPTION 'translation queue identity or lease contract missing'; END IF;
 definition:=pg_get_functiondef('public.claim_dictionary_translation_job_v1()'::regprocedure);
 IF strpos(definition,'pg_advisory_xact_lock(674, 1)')=0
 OR strpos(definition,'>= 2')=0 OR strpos(definition,'active.priority = 0')=0
 OR strpos(definition,'attempt < 3')=0 OR strpos(definition,'FOR UPDATE SKIP LOCKED')=0
 THEN RAISE EXCEPTION 'translation queue concurrency or retry contract changed'; END IF;
 definition:=pg_get_functiondef('public.complete_dictionary_translation_job_v1(uuid,uuid,jsonb,text)'::regprocedure);
 IF strpos(definition,'FOR SHARE')=0 OR strpos(definition,'lease_token IS DISTINCT FROM p_lease_token')=0
 OR strpos(definition,'lease_expires_at <= clock_timestamp()')=0
 OR strpos(definition,'source_row_revision IS DISTINCT FROM v_source_revision')=0
 OR strpos(definition,'INSERT INTO public.word_entry_translations')=0
 THEN RAISE EXCEPTION 'translation publication fencing contract changed'; END IF;
END;
$translation_jobs_contract$;
