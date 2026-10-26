\i db/deploy-contract/read-only-postflight-203.sql

DO $admin_user_registry_read_only_204$
DECLARE
  signature_oid oid := to_regprocedure('public.admin_user_registry_page(text,uuid,integer,integer)');
BEGIN
  IF signature_oid IS NULL
     OR has_function_privilege('anon', signature_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', signature_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', signature_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'admin user registry RPC is not service-role-only';
  END IF;
END
$admin_user_registry_read_only_204$;
