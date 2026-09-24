-- Preserve the complete contract-164 surface, then assert the admin boundary.
\i db/deploy-contract/postflight-164.sql

BEGIN;
DO $postflight_admin_console$
DECLARE
  v_trigger_definition text;
BEGIN
  IF to_regclass('public.admin_operators') IS NULL
     OR to_regclass('public.admin_operator_sessions') IS NULL
     OR to_regclass('public.admin_audit_events') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed admin-tables';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_class
       WHERE oid = 'public.admin_operators'::regclass AND relrowsecurity
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_class
       WHERE oid = 'public.admin_operator_sessions'::regclass AND relrowsecurity
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_class
       WHERE oid = 'public.admin_audit_events'::regclass AND relrowsecurity
     )
     OR has_table_privilege('anon', 'public.admin_operators', 'SELECT')
     OR has_table_privilege('authenticated', 'public.admin_operators', 'SELECT')
     OR has_table_privilege('anon', 'public.admin_operator_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.admin_operator_sessions', 'SELECT')
     OR has_table_privilege('anon', 'public.admin_audit_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT')
     OR has_table_privilege('service_role', 'public.admin_audit_events', 'UPDATE')
     OR has_table_privilege('service_role', 'public.admin_audit_events', 'DELETE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed admin-grants-or-rls';
  END IF;

  SELECT pg_get_functiondef('public.set_default_user_settings()'::regprocedure)
    INTO v_trigger_definition;
  IF v_trigger_definition IS NULL
     OR v_trigger_definition NOT ILIKE '%admin_operators%'
     OR v_trigger_definition NOT ILIKE '%user_settings%'
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_user_settings_seed'
         AND tgrelid = 'auth.users'::regclass
         AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed operator-user-seed-trigger';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM cron.job
       WHERE jobname = 'admin-audit-retention-365-days'
         AND command ILIKE '%admin_audit_events%'
         AND command ILIKE '%365 days%'
         AND schedule = '17 3 * * *'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed audit-retention-job';
  END IF;
END
$postflight_admin_console$;
COMMIT;
