-- Retain the canonical scheduler/session contract and verify the local study
-- day statistics seam introduced by migration 145.
\i db/deploy-contract/postflight-144.sql

DO $postflight_local_study_day_counters$
DECLARE
  user_timezone regprocedure := to_regprocedure(
    'private.training_user_timezone_v1(uuid)'
  );
  study_date regprocedure := to_regprocedure(
    'private.training_study_day_date_v1(timestamp with time zone,text)'
  );
  study_bounds regprocedure := to_regprocedure(
    'private.training_study_day_bounds_v1(timestamp with time zone,text)'
  );
  local_stats regprocedure := to_regprocedure(
    'private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)'
  );
  stats_local regprocedure := to_regprocedure(
    'public.get_detailed_training_stats(uuid,text[],uuid,text,text)'
  );
  stats_compat regprocedure := to_regprocedure(
    'public.get_detailed_training_stats(uuid,text[],uuid,text)'
  );
BEGIN
  IF user_timezone IS NULL
     OR study_date IS NULL
     OR study_bounds IS NULL
     OR local_stats IS NULL
     OR stats_local IS NULL
     OR stats_compat IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-study-day-signatures';
  END IF;

  IF NOT has_function_privilege('authenticated', stats_local, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', stats_compat, 'EXECUTE')
     OR has_function_privilege('anon', stats_local, 'EXECUTE')
     OR has_function_privilege('anon', stats_compat, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-study-day-grants';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc procedure_state
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure_state.proacl, acldefault('f', procedure_state.proowner))
    ) access_control
    WHERE procedure_state.oid IN (
      user_timezone::oid,
      study_date::oid,
      study_bounds::oid,
      local_stats::oid
    )
      AND access_control.privilege_type = 'EXECUTE'
      AND access_control.grantee IN (
        0,
        (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
      )
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-study-day-security';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure_state
    WHERE procedure_state.oid = stats_local::oid
      AND procedure_state.prosecdef
      AND procedure_state.provolatile = 's'
      AND procedure_state.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=public, private, pg_temp']::text[]
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-stats-security';
  END IF;
END
$postflight_local_study_day_counters$;
