DO $$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.begin_provider_work_v1(text,text,uuid,integer,jsonb)',
  'public.finish_provider_work_v1(text,text,uuid,jsonb,text)',
  'public.read_provider_work_v1(text,text)'
 ] LOOP
  IF to_regprocedure(signature) IS NULL OR NOT has_function_privilege('service_role',signature,'execute')
    OR has_function_privilege('anon',signature,'execute') OR has_function_privilege('authenticated',signature,'execute')
    THEN RAISE EXCEPTION 'provider_work_rpc_contract_failed:%',signature; END IF;
 END LOOP;
 IF to_regclass('private.provider_work') IS NULL OR to_regclass('private.provider_admission_windows') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.provider_work'::regclass AND relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='private.provider_admission_windows'::regclass AND relrowsecurity)
 OR to_regclass('private.provider_work_active') IS NULL
 OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='provider-work-retention')
 THEN RAISE EXCEPTION 'provider_work_storage_contract_failed'; END IF;
END $$;
