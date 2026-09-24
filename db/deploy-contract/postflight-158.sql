-- Verify that Training scope is only reachable through its owner-checking RPCs.
\i db/deploy-contract/postflight-157.sql

BEGIN;
DO $postflight_user_training_scopes_security$
DECLARE
  v_table_oid oid := to_regclass('public.user_training_scopes');
  v_table_owner oid;
  v_get_rpc oid := to_regprocedure('public.get_active_training_scope(uuid,text)');
  v_update_rpc oid := to_regprocedure(
    'public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],integer)'
  );
  v_problem text;
BEGIN
  IF v_table_oid IS NULL OR v_get_rpc IS NULL OR v_update_rpc IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed user-training-scopes-signature';
  END IF;

  SELECT relowner
    INTO v_table_owner
    FROM pg_class
   WHERE oid = v_table_oid;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_class
     WHERE oid = v_table_oid
       AND relrowsecurity
       AND NOT relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed user-training-scopes-rls';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_policy
     WHERE polrelid = v_table_oid
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed user-training-scopes-direct-policies';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM aclexplode(
        COALESCE(
          (SELECT relacl FROM pg_class WHERE oid = v_table_oid),
          acldefault('r', v_table_owner)
        )
      ) AS acl
     WHERE acl.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
       AND acl.privilege_type IN (
         'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
         'REFERENCES', 'TRIGGER', 'MAINTAIN'
       )
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed user-training-scopes-table-grants';
  END IF;

  SELECT string_agg(format('%s.%s:%s', roles.role_name, columns.attname, privileges.privilege), ', ')
    INTO v_problem
    FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
    CROSS JOIN pg_attribute AS columns
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS privileges(privilege)
   WHERE columns.attrelid = v_table_oid
     AND columns.attnum > 0
     AND NOT columns.attisdropped
     AND has_column_privilege(
       roles.role_name,
       v_table_oid,
       columns.attname,
       privileges.privilege
     );

  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed user-training-scopes-column-grants:%', v_problem;
  END IF;

  IF NOT has_function_privilege('authenticated', v_get_rpc, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_update_rpc, 'EXECUTE')
     OR has_function_privilege('anon', v_get_rpc, 'EXECUTE')
     OR has_function_privilege('anon', v_update_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed user-training-scopes-rpc-grants';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS p
     WHERE p.oid IN (v_get_rpc, v_update_rpc)
       AND (
         NOT p.prosecdef
         OR p.proowner <> v_table_owner
         OR NOT EXISTS (
           SELECT 1
             FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS settings(setting)
            WHERE setting LIKE 'search_path=public, pg_temp%'
         )
         OR p.prosrc NOT LIKE '%p_user_id IS DISTINCT FROM (select auth.uid())%'
       )
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed user-training-scopes-rpc-boundary';
  END IF;
END
$postflight_user_training_scopes_security$;
COMMIT;
