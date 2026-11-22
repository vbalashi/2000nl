\i db/deploy-contract/read-only-postflight-387.sql
DO $$
DECLARE
  membership_rpc regprocedure := to_regprocedure('public.admin_user_tester_access(uuid,uuid,uuid,boolean)');
BEGIN
  IF membership_rpc IS NULL OR NOT has_function_privilege('service_role', membership_rpc, 'EXECUTE')
    OR has_function_privilege('anon', membership_rpc, 'EXECUTE')
    OR has_function_privilege('authenticated', membership_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Tester membership RPC privileges do not match the contract';
  END IF;
END;
$$;
