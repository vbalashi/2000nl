\i db/deploy-contract/read-only-postflight-390.sql
DO $$
DECLARE accessor regprocedure := to_regprocedure('public.admin_owner_user_access_v1(uuid,uuid,uuid,text,boolean)');
BEGIN
  IF accessor IS NULL OR NOT has_function_privilege('service_role', accessor, 'EXECUTE')
    OR has_function_privilege('anon', accessor, 'EXECUTE')
    OR has_function_privilege('authenticated', accessor, 'EXECUTE')
    OR has_function_privilege('authenticator', accessor, 'EXECUTE')
    OR has_function_privilege('supabase_auth_admin', accessor, 'EXECUTE') THEN
    RAISE EXCEPTION 'Owner access-group privileges do not match the contract';
  END IF;
END;
$$;
