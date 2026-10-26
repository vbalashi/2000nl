\i db/deploy-contract/postflight-203.sql

DO $admin_user_registry_204$
DECLARE
  signature_oid oid := to_regprocedure('public.admin_user_registry_page(text,uuid,integer,integer)');
  definition text;
BEGIN
  IF signature_oid IS NULL THEN
    RAISE EXCEPTION 'admin user registry RPC is missing';
  END IF;

  IF has_function_privilege('anon', signature_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', signature_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', signature_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'admin user registry RPC grants are invalid';
  END IF;

  definition := pg_get_functiondef(signature_oid);
  IF position('auth.users' IN definition) = 0
     OR position('public.user_word_lists' IN definition) = 0
     OR position('public.user_word_list_items' IN definition) = 0
     OR position('public.admin_operators' IN definition) = 0
     OR position('operator_account.user_id' IN definition) = 0
     OR position('operator_account.email' IN definition) = 0
     OR position('subscription_tier' IN definition) > 0 THEN
    RAISE EXCEPTION 'admin user registry RPC does not follow its bounded source contract';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.admin_operators'::regclass
         AND conname = 'admin_operators_permissions_allowed'
         AND pg_get_constraintdef(oid) LIKE '%users.read%'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.admin_audit_events'::regclass
         AND conname = 'admin_audit_events_action_allowed'
         AND pg_get_constraintdef(oid) LIKE '%user.registry.read%'
         AND pg_get_constraintdef(oid) LIKE '%user.profile.read%'
     ) THEN
    RAISE EXCEPTION 'admin user permission or audit action constraints are missing';
  END IF;
END
$admin_user_registry_204$;
