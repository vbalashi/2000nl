-- Migrations 140–143 replace the retired v1 candidate and count-only plan
-- body. This probe asserts the current public/session compatibility surface
-- directly, rather than inheriting a historical implementation-shape check.

DO $postflight_sequential_ordinary_meanings$
DECLARE
  timezone_normalizer regprocedure := to_regprocedure(
    'private.training_schedule_timezone_v1(text)'
  );
  next_available regprocedure := to_regprocedure(
    'private.next_ordinary_meaning_available_at_v1(timestamp with time zone,text)'
  );
  activation_recorder regprocedure := to_regprocedure(
    'private.record_ordinary_meaning_activation_v1(uuid,uuid)'
  );
  status_trigger_fn regprocedure := to_regprocedure(
    'private.sync_ordinary_meaning_status_activation_v1()'
  );
  known_trigger_fn regprocedure := to_regprocedure(
    'private.sync_ordinary_meaning_known_activation_v1()'
  );
  timezone_trigger_fn regprocedure := to_regprocedure(
    'private.sync_training_schedule_timezone_v1()'
  );
  direct_group_refresh regprocedure := to_regprocedure(
    'private.refresh_unrenderable_ordinary_direct_group_v1(uuid,text,text)'
  );
  direct_binding_trigger_fn regprocedure := to_regprocedure(
    'private.sync_unrenderable_ordinary_direct_binding_v1()'
  );
  renderability_gate regprocedure := to_regprocedure(
    'private.training_ordinary_direct_recall_renderable_v1(uuid,integer,text)'
  );
  direct_entry_refresh regprocedure := to_regprocedure(
    'private.refresh_unrenderable_ordinary_direct_entry_v1(uuid)'
  );
  direct_content_trigger_fn regprocedure := to_regprocedure(
    'private.sync_unrenderable_ordinary_direct_entry_v1()'
  );
  candidate_fn regprocedure := to_regprocedure(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
  );
  session_members_fn regprocedure := to_regprocedure(
    'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text)'
  );
  direct_selector regprocedure := to_regprocedure(
    'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)'
  );
  cached_direct_selector regprocedure := to_regprocedure(
    'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])'
  );
  filtered_selector regprocedure := to_regprocedure(
    'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)'
  );
  cached_filtered_selector regprocedure := to_regprocedure(
    'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)'
  );
  session_plan regprocedure := to_regprocedure(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)'
  );
  start_session regprocedure := to_regprocedure(
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)'
  );
  session_snapshot regprocedure := to_regprocedure(
    'public.get_training_session_snapshot(uuid,uuid)'
  );
  candidate_definition text;
BEGIN
  IF timezone_normalizer IS NULL
     OR next_available IS NULL
     OR activation_recorder IS NULL
     OR status_trigger_fn IS NULL
     OR known_trigger_fn IS NULL
     OR timezone_trigger_fn IS NULL
     OR direct_group_refresh IS NULL
     OR direct_binding_trigger_fn IS NULL
     OR renderability_gate IS NULL
     OR direct_entry_refresh IS NULL
     OR direct_content_trigger_fn IS NULL
     OR candidate_fn IS NULL
     OR session_members_fn IS NULL
     OR direct_selector IS NULL
     OR cached_direct_selector IS NULL
     OR filtered_selector IS NULL
     OR cached_filtered_selector IS NULL
     OR session_plan IS NULL
     OR start_session IS NULL
     OR session_snapshot IS NULL
     OR to_regclass('private.ordinary_meaning_introduction_unlocks_v1') IS NULL
     OR to_regclass('private.unrenderable_ordinary_direct_entries_v1') IS NULL
     OR to_regprocedure('public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sequential-ordinary-signatures';
  END IF;

  IF to_regprocedure(
       'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean)'
     ) IS NOT NULL
     OR to_regprocedure(
       'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed obsolete-private-scheduler-v1';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_proc procedure_state
       WHERE procedure_state.oid = candidate_fn::oid
         AND procedure_state.prosecdef
         AND procedure_state.provolatile = 'v'
         AND procedure_state.proconfig IS NOT DISTINCT FROM
           ARRAY['search_path=public, private, pg_temp']::text[]
     )
     OR has_function_privilege('service_role', candidate_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', candidate_fn, 'EXECUTE')
     OR has_function_privilege('anon', candidate_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed current-scheduler-boundary';
  END IF;

  IF NOT has_function_privilege('authenticated', direct_selector, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', cached_direct_selector, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', filtered_selector, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', cached_filtered_selector, 'EXECUTE')
     OR has_function_privilege('anon', direct_selector, 'EXECUTE')
     OR has_function_privilege('anon', cached_direct_selector, 'EXECUTE')
     OR has_function_privilege('anon', filtered_selector, 'EXECUTE')
     OR has_function_privilege('anon', cached_filtered_selector, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed public-scheduler-grants';
  END IF;

  IF NOT has_function_privilege('authenticated', session_plan, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', start_session, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', session_snapshot, 'EXECUTE')
     OR has_function_privilege('anon', session_plan, 'EXECUTE')
     OR has_function_privilege('anon', start_session, 'EXECUTE')
     OR has_function_privilege('anon', session_snapshot, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-session-grants';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns column_state
    WHERE column_state.table_schema = 'public'
      AND column_state.table_name = 'user_settings'
      AND column_state.column_name = 'training_schedule_timezone'
      AND column_state.is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sequential-ordinary-timezone-column';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_state
    WHERE constraint_state.conrelid = 'private.ordinary_meaning_introduction_unlocks_v1'::regclass
      AND constraint_state.contype = 'p'
      AND pg_get_constraintdef(constraint_state.oid) = 'PRIMARY KEY (user_id, entry_id)'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sequential-ordinary-unlock-key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc procedure_state
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure_state.proacl, acldefault('f', procedure_state.proowner))
    ) access_control
    WHERE procedure_state.oid IN (
      timezone_normalizer::oid,
      next_available::oid,
      activation_recorder::oid,
      status_trigger_fn::oid,
      known_trigger_fn::oid,
      timezone_trigger_fn::oid,
      direct_group_refresh::oid,
      direct_binding_trigger_fn::oid,
      renderability_gate::oid,
      direct_entry_refresh::oid,
      direct_content_trigger_fn::oid
    )
      AND access_control.privilege_type = 'EXECUTE'
      AND access_control.grantee IN (
        0,
        (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
      )
  ) OR has_table_privilege('authenticated', 'private.ordinary_meaning_introduction_unlocks_v1', 'SELECT') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sequential-ordinary-security';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_state
    WHERE trigger_state.tgrelid = 'public.user_card_status'::regclass
      AND trigger_state.tgfoid = status_trigger_fn::oid
      AND NOT trigger_state.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_state
    WHERE trigger_state.tgrelid = 'public.user_card_known_marks'::regclass
      AND trigger_state.tgfoid = known_trigger_fn::oid
      AND NOT trigger_state.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_state
    WHERE trigger_state.tgrelid = 'public.training_sessions'::regclass
      AND trigger_state.tgfoid = timezone_trigger_fn::oid
      AND NOT trigger_state.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_state
    WHERE trigger_state.tgrelid = 'private.source_entry_bindings'::regclass
      AND trigger_state.tgfoid = direct_binding_trigger_fn::oid
      AND NOT trigger_state.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_state
    WHERE trigger_state.tgrelid = 'private.platform_v2_content_nodes'::regclass
      AND trigger_state.tgfoid = direct_content_trigger_fn::oid
      AND NOT trigger_state.tgisinternal
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sequential-ordinary-triggers';
  END IF;

  candidate_definition := upper(pg_get_functiondef(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure
  ));
  IF position('ORDINARY_SOURCE_INTRODUCTIONS AS MATERIALIZED' IN candidate_definition) = 0
     OR position('ORDINARY_MEANING_INTRODUCTION_UNLOCKS_V1' IN candidate_definition) = 0
     OR position('UNRENDERABLE_ORDINARY_DIRECT_ENTRIES_V1' IN candidate_definition) = 0
     OR position('CARD_TYPE_ID = ''WORD-TO-DEFINITION''' IN candidate_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed sequential-ordinary-routing';
  END IF;
END
$postflight_sequential_ordinary_meanings$;
