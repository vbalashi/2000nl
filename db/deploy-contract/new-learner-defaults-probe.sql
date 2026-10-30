-- Metadata-only feature contract. Does not enable the installation policy.
DO $probe$
DECLARE role_name text; table_name text; helper text; definition text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['new_learner_defaults','new_learner_initializations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='private' AND c.relname=table_name AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'new_learner_defaults_rls_required: %',table_name;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(role_name,'private.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
        OR has_any_column_privilege(role_name,'private.'||table_name,'SELECT,INSERT,UPDATE') THEN
        RAISE EXCEPTION 'new_learner_defaults_table_exposed: %/%',role_name,table_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(role_name,'public.configure_new_learner_defaults_v1(integer,jsonb)','EXECUTE')
      IS DISTINCT FROM (role_name='service_role') THEN
      RAISE EXCEPTION 'new_learner_defaults_configure_permissions: %',role_name;
    END IF;
    FOREACH helper IN ARRAY ARRAY['private.is_valid_new_learner_defaults_v1(jsonb)',
      'private.resolve_new_learner_defaults_v1(jsonb,uuid)'] LOOP
      IF has_function_privilege(role_name,helper,'EXECUTE') THEN
        RAISE EXCEPTION 'new_learner_defaults_helper_exposed: %/%',role_name,helper;
      END IF;
    END LOOP;
  END LOOP;
  SELECT pg_get_functiondef('public.set_default_user_settings()'::regprocedure) INTO definition;
  IF position('public.admin_operators' IN definition)=0
    OR position('ON CONFLICT DO NOTHING' IN definition)=0
    OR position('IF NOT FOUND THEN RETURN NEW' IN definition)=0
    OR position('FOR SHARE' IN definition)=0
    OR position('private.resolve_new_learner_defaults_v1' IN definition)=0 THEN
    RAISE EXCEPTION 'new_learner_initialization_boundary_missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass
    AND tgname='trg_user_settings_seed' AND tgfoid='public.set_default_user_settings()'::regprocedure
    AND tgtype=5 AND tgenabled='O') THEN
    RAISE EXCEPTION 'new_learner_insert_trigger_missing';
  END IF;
END;
$probe$;
