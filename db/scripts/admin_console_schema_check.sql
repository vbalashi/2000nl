BEGIN;

DO $admin_console_schema_check$
DECLARE
    v_operator_user_id uuid := '6ad4a774-2f3d-4a0e-a480-000000000001';
    v_learner_user_id uuid := '6ad4a774-2f3d-4a0e-a480-000000000002';
    v_operator_email text := 'admin480@example.invalid';
    v_learner_email text := 'learner480@example.invalid';
    v_job_command text;
BEGIN
    IF to_regclass('public.admin_operators') IS NULL
       OR to_regclass('public.admin_operator_sessions') IS NULL
       OR to_regclass('public.admin_audit_events') IS NULL THEN
        RAISE EXCEPTION 'admin console tables are missing';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_class AS relation
         WHERE relation.oid IN (
             'public.admin_operators'::regclass,
             'public.admin_operator_sessions'::regclass,
             'public.admin_audit_events'::regclass
         )
           AND NOT relation.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'admin console RLS is disabled';
    END IF;

    IF has_table_privilege('anon', 'public.admin_operators', 'SELECT')
       OR has_table_privilege('authenticated', 'public.admin_operators', 'SELECT')
       OR has_table_privilege('anon', 'public.admin_audit_events', 'SELECT')
       OR has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT')
       OR has_table_privilege('anon', 'public.admin_operator_sessions', 'SELECT')
       OR has_table_privilege('authenticated', 'public.admin_operator_sessions', 'SELECT') THEN
        RAISE EXCEPTION 'browser roles have direct admin table access';
    END IF;

    IF NOT has_table_privilege('service_role', 'public.admin_operators', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.admin_operator_sessions', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.admin_audit_events', 'INSERT')
       OR has_table_privilege('service_role', 'public.admin_audit_events', 'UPDATE')
       OR has_table_privilege('service_role', 'public.admin_audit_events', 'DELETE') THEN
        RAISE EXCEPTION 'admin service-role privileges do not match the narrow contract';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_proc AS procedure
         WHERE procedure.oid = 'public.set_default_user_settings()'::regprocedure
           AND procedure.prosecdef
           AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']
           AND pg_get_functiondef(procedure.oid) ILIKE '%admin_operators%'
    ) THEN
        RAISE EXCEPTION 'learner settings trigger does not honor the operator allowlist';
    END IF;

    SELECT command INTO v_job_command
      FROM cron.job
     WHERE jobname = 'admin-audit-retention-365-days';
    IF v_job_command IS NULL
       OR v_job_command NOT ILIKE '%DELETE FROM public.admin_audit_events%'
       OR v_job_command NOT ILIKE '%365 days%' THEN
        RAISE EXCEPTION 'one-year audit retention job is missing';
    END IF;

    INSERT INTO public.admin_operators (email, is_active, permissions)
    VALUES (v_operator_email, true, ARRAY['dictionaries.read', 'audit.read']);

    INSERT INTO auth.users (id, email)
    VALUES (v_operator_user_id, v_operator_email);

    IF EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = v_operator_user_id) THEN
        RAISE EXCEPTION 'allowlisted operator received learner settings';
    END IF;

    INSERT INTO auth.users (id, email)
    VALUES (v_learner_user_id, v_learner_email);

    IF NOT EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = v_learner_user_id) THEN
        RAISE EXCEPTION 'ordinary learner signup no longer receives settings';
    END IF;
END
$admin_console_schema_check$;

ROLLBACK;
