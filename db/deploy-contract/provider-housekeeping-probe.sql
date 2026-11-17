DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.fetch_words_for_list_gated(uuid,text,text,text,boolean,boolean,boolean,integer,integer)',
    'public.can_access_dictionary(uuid,uuid,text)',
    'public.fetch_dictionary_entry_gated(text)',
    'public.perform_platform_card_action(uuid,uuid,text,text,text,uuid,text,jsonb)',
    'public.perform_platform_card_action(uuid,uuid,text,text,text,uuid,text,jsonb,text,text)',
    'public.can_browse_dictionary(uuid,uuid)',
    'public.can_browse_dictionary(uuid,uuid,text)'
  ] LOOP
    IF has_function_privilege('provider_housekeeping',signature,'execute')
       OR NOT has_function_privilege('anon',signature,'execute')
       OR NOT has_function_privilege('authenticated',signature,'execute')
       OR NOT has_function_privilege('service_role',signature,'execute') THEN
      RAISE EXCEPTION 'db-contract-gate: rpc ACL boundary changed: %',signature;
    END IF;
  END LOOP;

  IF to_regprocedure('provider_housekeeping.run_provider_housekeeping_v1(text)') IS NULL
     OR to_regprocedure('provider_housekeeping.inspect_provider_housekeeping_v1(text)') IS NULL
     OR NOT has_schema_privilege('provider_housekeeping','provider_housekeeping','usage')
     OR NOT has_function_privilege('provider_housekeeping','provider_housekeeping.run_provider_housekeeping_v1(text)','execute')
     OR NOT has_function_privilege('provider_housekeeping','provider_housekeeping.inspect_provider_housekeeping_v1(text)','execute')
     OR has_schema_privilege('anon','provider_housekeeping','usage')
     OR has_schema_privilege('authenticated','provider_housekeeping','usage')
     OR has_schema_privilege('service_role','provider_housekeeping','usage') THEN
    RAISE EXCEPTION 'db-contract-gate: provider housekeeping boundary changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='provider_housekeeping'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: provider housekeeping role widened';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef
      AND has_schema_privilege('provider_housekeeping',n.oid,'usage')
      AND has_function_privilege('provider_housekeeping',p.oid,'execute')
      AND p.oid NOT IN (
        'provider_housekeeping.run_provider_housekeeping_v1(text)'::regprocedure,
        'provider_housekeeping.inspect_provider_housekeeping_v1(text)'::regprocedure
      )
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: housekeeping role inherited another security definer';
  END IF;
END $$;
