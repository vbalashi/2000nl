DO $$
DECLARE rpc regprocedure;
BEGIN
  FOREACH rpc IN ARRAY ARRAY[
    'public.read_assistant_allowances_v1(uuid,boolean)'::regprocedure,
    'public.reserve_assistant_allowance_v1(uuid,text,uuid,boolean)'::regprocedure,
    'public.settle_assistant_allowance_v1(uuid,text,uuid,boolean)'::regprocedure,
    'public.admin_assistant_allowances_v1(uuid,uuid,uuid,boolean)'::regprocedure,
    'public.admin_grant_assistant_allowance_v1(uuid,uuid,uuid,uuid,integer,integer,text)'::regprocedure,
    'public.admin_grant_manual_premium_v1(uuid,uuid,uuid,timestamptz,text)'::regprocedure
  ] LOOP
    IF NOT has_function_privilege('service_role',rpc,'EXECUTE')
      OR has_function_privilege('authenticated',rpc,'EXECUTE')
      OR has_function_privilege('anon',rpc,'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected allowance RPC ACL: %',rpc;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM private.assistant_allowance_defaults WHERE singleton) <> 1 THEN
    RAISE EXCEPTION 'Assistant allowance configuration missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.word_entries'::regclass AND tgname='track_personal_meaning_usage'
      AND NOT tgisinternal AND tgenabled='O'
  ) THEN
    RAISE EXCEPTION 'Personal meaning allowance trigger missing';
  END IF;
END;
$$;
