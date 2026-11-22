\i db/deploy-contract/read-only-postflight-389.sql
DO $$
DECLARE procedure_name regprocedure;
BEGIN
  FOREACH procedure_name IN ARRAY ARRAY[
    to_regprocedure('public.admin_user_learning_overview_v1(uuid,uuid,uuid,text,date)'),
    to_regprocedure('public.admin_user_access_details_v1(uuid,uuid,uuid)')
  ] LOOP
    IF procedure_name IS NULL OR NOT has_function_privilege('service_role', procedure_name, 'EXECUTE')
      OR has_function_privilege('anon', procedure_name, 'EXECUTE')
      OR has_function_privilege('authenticated', procedure_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'Admin learning overview privileges do not match the contract';
    END IF;
  END LOOP;
END;
$$;
