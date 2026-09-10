-- Keep all prior deployment checks and verify the V2 Details action boundary.
\i db/deploy-contract/postflight-132.sql

DO $$
DECLARE
  required_regprocedure regprocedure;
BEGIN
  FOREACH required_regprocedure IN ARRAY ARRAY[
    to_regprocedure('public.perform_platform_v2_details_action(uuid,text,uuid,text,text,uuid,jsonb,text,text)'),
    to_regprocedure('public.perform_platform_v2_details_action_as_principal(uuid,text,uuid,text,text,uuid,jsonb,text,text)')
  ] LOOP
    IF required_regprocedure IS NULL THEN
      RAISE EXCEPTION 'required migration 133 function is missing';
    END IF;
  END LOOP;

  IF has_function_privilege(
    'anon',
    'public.perform_platform_v2_details_action(uuid,text,uuid,text,text,uuid,jsonb,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.perform_platform_v2_details_action(uuid,text,uuid,text,text,uuid,jsonb,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'direct Details action RPC must remain service-only';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.perform_platform_v2_details_action_as_principal(uuid,text,uuid,text,text,uuid,jsonb,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service role cannot execute Details action RPC';
  END IF;
END;
$$;
