-- Verify the shared scheduler implementation and retain every still-live
-- scheduler/session contract from the preceding postflight chain. Historical
-- probes cannot be included directly because they reference private v1,
-- which migration 140 intentionally removes.
BEGIN;

DO $postflight$
DECLARE
  shared_selector regprocedure := to_regprocedure(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
  );
  selector_definition text;
  direct_definition text;
  filtered_definition text;
BEGIN
  IF shared_selector IS NULL
     OR to_regprocedure('public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)') IS NULL
     OR to_regprocedure('public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)') IS NULL
     OR to_regprocedure('public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('public.get_training_session_snapshot(uuid,uuid)') IS NULL
     OR to_regprocedure('private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed shared-scheduler-signatures';
  END IF;

  IF to_regprocedure(
       'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean)'
     ) IS NOT NULL
     OR to_regprocedure(
       'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed obsolete-private-scheduler-v1';
  END IF;

  IF to_regprocedure('public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])') IS NOT NULL
     OR to_regprocedure('public.get_next_card_without_known(uuid,text[],uuid[],uuid,text,text,text,text[])') IS NOT NULL
     OR to_regprocedure('public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)') IS NOT NULL
     OR to_regprocedure('public.get_next_filtered_card_without_known(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed legacy-scheduler-overloads';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure_state
    WHERE procedure_state.oid = shared_selector::oid
      AND procedure_state.prosecdef
      AND procedure_state.provolatile = 'v'
      AND procedure_state.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=public, private, pg_temp']::text[]
      AND pg_get_userbyid(procedure_state.proowner) = 'postgres'
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc procedure_state
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure_state.proacl, acldefault('f', procedure_state.proowner))
    ) access_control
    WHERE procedure_state.oid = shared_selector::oid
      AND access_control.privilege_type = 'EXECUTE'
      AND access_control.grantee IN (
        0,
        (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
        (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
        (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
      )
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed shared-scheduler-security';
  END IF;

  selector_definition := upper(pg_get_functiondef(shared_selector));
  IF position('READABLE_DICTIONARIES AS MATERIALIZED' IN selector_definition) = 0
     OR position('LEFT JOIN READABLE_DICTIONARIES READABLE_DICTIONARY' IN selector_definition) = 0
     OR position('DEFAULT_TRAINING_SCOPE_ENTRIES_V1' IN selector_definition) = 0
     OR position('TODAY_NEW_WORDS AS MATERIALIZED' IN selector_definition) = 0
     OR position('TODAY_NEW_CARDS AS MATERIALIZED' IN selector_definition) = 0
     OR position('KNOWN_CARDS AS MATERIALIZED' IN selector_definition) = 0
     OR position('LEARNER_STATUS AS MATERIALIZED' IN selector_definition) = 0
     OR position('P_ENFORCE_DAILY_LIMITS' IN selector_definition) = 0
     OR (length(selector_definition) - length(replace(
       selector_definition, 'CAN_ACCESS_DICTIONARY(', ''
     ))) / length('CAN_ACCESS_DICTIONARY(') <> 1 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed shared-scheduler-body';
  END IF;

  direct_definition := upper(pg_get_functiondef(
    'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)'::regprocedure
  ));
  filtered_definition := upper(pg_get_functiondef(
    'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)'::regprocedure
  ));
  IF position('TRAINING_SCHEDULER_CANDIDATES_V2' IN direct_definition) = 0
     OR position('TRAINING_SCHEDULER_CANDIDATES_V1' IN direct_definition) > 0
     OR position('P_ALLOW_PRACTICE OR CANDIDATE.QUEUE_SOURCE <> ''PRACTICE''' IN direct_definition) = 0
     OR position('TRAINING_SCHEDULER_CANDIDATES_V2' IN filtered_definition) = 0
     OR position('TRAINING_SCHEDULER_CANDIDATES_V1' IN filtered_definition) > 0
     OR position('P_CARD_FILTER = ''REVIEW'' AND P_ALLOW_PRACTICE' IN filtered_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed public-scheduler-v2-routing';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed public-scheduler-grants';
  END IF;

  IF (
    SELECT count(DISTINCT index_relation.relname)
    FROM pg_index index_state
    JOIN pg_class index_relation ON index_relation.oid = index_state.indexrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname IN (
        'word_entries_pointer_only_scheduler_exclusion_v1_idx',
        'word_entries_training_sibling_count_v1_idx'
      )
      AND index_state.indisvalid
      AND index_state.indisready
  ) <> 2 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed scheduler-index';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns column_row
    WHERE table_schema = 'public'
      AND table_name = 'training_sessions'
      AND column_name = 'requested_total'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed action-budget-session';
  END IF;
END
$postflight$;

-- These are the non-obsolete assertions accumulated by postflight 128-139.
-- Keep them in the active probe rather than weakening deployment protection
-- when the historical v1-body probe is superseded.
DO $retained_contracts$
DECLARE
  sync_oid regprocedure := to_regprocedure(
    'private.sync_default_training_scope_entry_v1()'
  );
  counts_oid regprocedure := to_regprocedure(
    'private.default_training_session_plan_counts_v1(uuid,text[],text,text,jsonb)'
  );
  legacy_plan_oid regprocedure := to_regprocedure(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)'
  );
  scope_plan jsonb;
  scope_plan_text text;
  stats_oid regprocedure := to_regprocedure(
    'public.get_detailed_training_stats(uuid,text[],uuid,text)'
  );
  history_oid regprocedure := to_regprocedure(
    'public.get_recent_training_review_history(integer)'
  );
  stats_definition text;
  history_definition text;
  fsrs_definition text;
  counts_definition text;
  legacy_plan_definition text;
  sync_definition text;
  known_trigger record;
BEGIN
  IF sync_oid IS NULL
     OR counts_oid IS NULL
     OR legacy_plan_oid IS NULL
     OR to_regclass('private.default_training_scope_entries_v1') IS NULL
     OR stats_oid IS NULL
     OR history_oid IS NULL
     OR to_regprocedure('public.fsrs6_compute(numeric,numeric,timestamptz,smallint,numeric,integer,integer,numeric[])') IS NULL
     OR to_regprocedure('private.shared_meaning_other_direction(text)') IS NULL
     OR to_regprocedure('private.sync_shared_meaning_known_mark()') IS NULL
     OR to_regprocedure('public.start_learning_entry_card(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.get_platform_v2_card_states_for_entries(uuid,uuid[],text[])') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-scheduler-signatures';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_proc procedure_state
       WHERE procedure_state.oid = sync_oid::oid
         AND procedure_state.prosecdef
         AND procedure_state.provolatile = 'v'
         AND procedure_state.proconfig @> ARRAY['search_path=public, private, pg_temp']::text[]
     )
     OR has_function_privilege('service_role', sync_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', sync_oid, 'EXECUTE')
     OR has_function_privilege('anon', sync_oid, 'EXECUTE')
     OR has_function_privilege('service_role', counts_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', legacy_plan_oid, 'EXECUTE')
     OR has_function_privilege('anon', legacy_plan_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', stats_oid, 'EXECUTE')
     OR has_function_privilege('anon', stats_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', history_oid, 'EXECUTE')
     OR has_function_privilege('anon', history_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-scheduler-grants';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_index index_state
       JOIN pg_class index_relation ON index_relation.oid = index_state.indexrelid
       JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
       WHERE index_namespace.nspname = 'public'
         AND index_relation.relname = 'word_entries_pointer_only_scheduler_exclusion_v1_idx'
         AND index_state.indisvalid AND index_state.indisready
         AND index_state.indpred IS NOT NULL
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_index index_state
       JOIN pg_class index_relation ON index_relation.oid = index_state.indexrelid
       JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
       WHERE index_namespace.nspname = 'public'
         AND index_relation.relname = 'word_entries_training_sibling_count_v1_idx'
         AND index_state.indisvalid AND index_state.indisready
         AND NOT index_state.indisunique
         AND index_state.indnkeyatts = 3
         AND index_state.indnatts = 3
         AND index_state.indpred IS NULL
         AND index_state.indexprs IS NULL
         AND index_state.indkey[0] = (
           SELECT attribute.attnum FROM pg_attribute attribute
           WHERE attribute.attrelid = 'public.word_entries'::regclass
             AND attribute.attname = 'dictionary_id'
         )
         AND index_state.indkey[1] = (
           SELECT attribute.attnum FROM pg_attribute attribute
           WHERE attribute.attrelid = 'public.word_entries'::regclass
             AND attribute.attname = 'language_code'
         )
         AND index_state.indkey[2] = (
           SELECT attribute.attnum FROM pg_attribute attribute
           WHERE attribute.attrelid = 'public.word_entries'::regclass
             AND attribute.attname = 'headword'
         )
         AND index_state.indcollation[0] = (
           SELECT attribute.attcollation FROM pg_attribute attribute
           WHERE attribute.attrelid = 'public.word_entries'::regclass
             AND attribute.attname = 'dictionary_id'
         )
         AND index_state.indcollation[1] = (
           SELECT attribute.attcollation FROM pg_attribute attribute
           WHERE attribute.attrelid = 'public.word_entries'::regclass
             AND attribute.attname = 'language_code'
         )
         AND index_state.indcollation[2] = (
           SELECT attribute.attcollation FROM pg_attribute attribute
           WHERE attribute.attrelid = 'public.word_entries'::regclass
             AND attribute.attname = 'headword'
         )
         AND index_state.indclass[0] = (
           SELECT operator_class.oid FROM pg_opclass operator_class
           WHERE operator_class.opcnamespace = 'pg_catalog'::regnamespace
             AND operator_class.opcmethod = index_relation.relam
             AND operator_class.opcname = 'uuid_ops'
             AND operator_class.opcdefault
             AND operator_class.opcintype = 'uuid'::regtype
         )
         AND index_state.indclass[1] = (
           SELECT operator_class.oid FROM pg_opclass operator_class
           WHERE operator_class.opcnamespace = 'pg_catalog'::regnamespace
             AND operator_class.opcmethod = index_relation.relam
             AND operator_class.opcname = 'text_ops'
             AND operator_class.opcdefault
             AND operator_class.opcintype = 'text'::regtype
         )
         AND index_state.indclass[2] = (
           SELECT operator_class.oid FROM pg_opclass operator_class
           WHERE operator_class.opcnamespace = 'pg_catalog'::regnamespace
             AND operator_class.opcmethod = index_relation.relam
             AND operator_class.opcname = 'text_ops'
             AND operator_class.opcdefault
             AND operator_class.opcintype = 'text'::regtype
         )
         AND index_state.indoption[0] = 0
         AND index_state.indoption[1] = 0
         AND index_state.indoption[2] = 0
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-scheduler-index';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_trigger trigger_state
       WHERE trigger_state.tgrelid = 'public.word_entries'::regclass
         AND trigger_state.tgname = 'sync_default_training_scope_entry_v1'
         AND trigger_state.tgfoid = sync_oid::oid
         AND trigger_state.tgtype = 21
         AND cardinality(trigger_state.tgattr::smallint[]) = 3
         AND trigger_state.tgattr::smallint[] @> ARRAY[
           (SELECT attribute.attnum::smallint FROM pg_attribute attribute
            WHERE attribute.attrelid = 'public.word_entries'::regclass
              AND attribute.attname = 'is_nt2_2000'),
           (SELECT attribute.attnum::smallint FROM pg_attribute attribute
            WHERE attribute.attrelid = 'public.word_entries'::regclass
              AND attribute.attname = 'raw'),
           (SELECT attribute.attnum::smallint FROM pg_attribute attribute
            WHERE attribute.attrelid = 'public.word_entries'::regclass
              AND attribute.attname = 'dictionary_id')
         ]::smallint[]
         AND trigger_state.tgenabled <> 'D'
         AND NOT trigger_state.tgisinternal
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-scope-sync';
  END IF;

  sync_definition := upper(pg_get_functiondef(sync_oid));
  IF position('NEW.IS_NT2_2000 = TRUE' IN sync_definition) = 0
     OR position('PRIVATE.IS_POINTER_ONLY_DICTIONARY_ENTRY_V1(NEW.RAW)' IN sync_definition) = 0
     OR position('INSERT INTO PRIVATE.DEFAULT_TRAINING_SCOPE_ENTRIES_V1' IN sync_definition) = 0
     OR position('ON CONFLICT (ENTRY_ID) DO UPDATE' IN sync_definition) = 0
     OR position('DELETE FROM PRIVATE.DEFAULT_TRAINING_SCOPE_ENTRIES_V1' IN sync_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-scope-sync-function';
  END IF;

  IF (
       SELECT array_agg(attribute.attname ORDER BY attribute.attnum)
       FROM pg_attribute attribute
       WHERE attribute.attrelid = 'private.default_training_scope_entries_v1'::regclass
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
     ) IS DISTINCT FROM ARRAY['entry_id', 'dictionary_id']::name[]
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint constraint_state
       WHERE constraint_state.conrelid = 'private.default_training_scope_entries_v1'::regclass
         AND constraint_state.confrelid = 'public.word_entries'::regclass
         AND constraint_state.contype = 'f'
         AND constraint_state.confdeltype = 'c'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-scope-shape';
  END IF;

  EXECUTE $scope_explain$
    EXPLAIN (FORMAT JSON, COSTS OFF)
    SELECT scope_entry.entry_id, scope_entry.dictionary_id
    FROM private.default_training_scope_entries_v1 scope_entry
  $scope_explain$
  INTO scope_plan;
  scope_plan_text := scope_plan::text;
  IF position('"Relation Name": "default_training_scope_entries_v1"' IN scope_plan_text) = 0
     OR position('"Relation Name": "word_entries"' IN scope_plan_text) > 0
     OR NOT has_table_privilege('service_role', 'public.app_db_contract_state', 'SELECT')
     OR has_table_privilege('anon', 'public.app_db_contract_state', 'SELECT')
     OR has_table_privilege('authenticated', 'public.app_db_contract_state', 'SELECT') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-scope-or-health-contract';
  END IF;

  stats_definition := upper(pg_get_functiondef(stats_oid));
  history_definition := upper(pg_get_functiondef(history_oid));
  counts_definition := upper(pg_get_functiondef(counts_oid));
  legacy_plan_definition := upper(pg_get_functiondef(legacy_plan_oid));
  fsrs_definition := upper(pg_get_functiondef(
    'public.fsrs6_compute(numeric,numeric,timestamptz,smallint,numeric,integer,integer,numeric[])'::regprocedure
  ));
  IF position('LEARNINGSTARTEDTODAY' IN stats_definition) = 0
     OR position('GRADUATEDNEWWORDSTODAY' IN stats_definition) = 0
     OR position('START-LEARNING' IN stats_definition) = 0
     OR position('LEARNING_STARTED' IN history_definition) = 0
     OR position('USER_CARD_ACTION_EVENTS' IN history_definition) = 0
     OR position('LIMITS AS MATERIALIZED' IN counts_definition) = 0
     OR position('READABLE_DICTIONARIES AS MATERIALIZED' IN counts_definition) = 0
     OR position('LEARNER_STATUS AS MATERIALIZED' IN counts_definition) = 0
     OR position('DEFAULT_TRAINING_SCOPE_ENTRIES_V1' IN counts_definition) = 0
     OR position('DEFAULT_TRAINING_SESSION_PLAN_COUNTS_V1' IN legacy_plan_definition) = 0
     OR position('TRAINING_SCHEDULER_CANDIDATES_V2' IN legacy_plan_definition) = 0
     OR position('TRAINING_SCHEDULER_CANDIDATES_V1' IN legacy_plan_definition) > 0
     OR position('SHORT-TERM STABILITY UPDATE' IN fsrs_definition) = 0
     OR position('GREATEST(P_STABILITY, NEW_STABILITY)' IN fsrs_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-observability-or-fsrs';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_training_session_snapshot(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_training_session_snapshot(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_next_training_session_card(uuid,uuid,text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_next_training_session_card(uuid,uuid,text[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_next_training_session_card(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_next_training_session_card(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.consume_training_session_member(uuid,uuid,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-session-grants';
  END IF;

  IF to_regprocedure('private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('private.consume_training_session_member(uuid,uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.get_next_training_session_card(uuid,uuid)') IS NULL
     OR to_regprocedure('public.get_next_training_session_card(uuid,uuid,text[])') IS NULL
     OR (SELECT provolatile FROM pg_proc
         WHERE oid = 'public.get_next_training_session_card(uuid,uuid,text[])'::regprocedure) IS DISTINCT FROM 's'
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'training_session_members'
         AND column_name = 'unavailable_reason'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-session-contract';
  END IF;

  SELECT trigger_row.tgenabled, trigger_row.tgfoid::regprocedure::text
    INTO known_trigger
    FROM pg_trigger trigger_row
   WHERE trigger_row.tgrelid = 'public.user_card_known_marks'::regclass
     AND trigger_row.tgname = 'sync_shared_meaning_known_mark'
     AND NOT trigger_row.tgisinternal;
  IF NOT FOUND
     OR known_trigger.tgenabled <> 'O'
     OR known_trigger.tgfoid::regprocedure::text <> 'private.sync_shared_meaning_known_mark()' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-shared-meaning-contract';
  END IF;
END
$retained_contracts$;

DO $retained_reading_size$
DECLARE
  settings_oid regclass := to_regclass('public.user_settings');
  phone_default text;
  desktop_default text;
  phone_constraint text;
  desktop_constraint text;
  phone_constraint_validated boolean;
  desktop_constraint_validated boolean;
BEGIN
  IF settings_oid IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed reading-size-table';
  END IF;

  SELECT pg_get_expr(default_state.adbin, default_state.adrelid)
    INTO phone_default
    FROM pg_attribute attribute_state
    JOIN pg_attrdef default_state
      ON default_state.adrelid = attribute_state.attrelid
     AND default_state.adnum = attribute_state.attnum
   WHERE attribute_state.attrelid = settings_oid
     AND attribute_state.attname = 'reading_size_phone'
     AND attribute_state.atttypid = 'text'::regtype
     AND attribute_state.attnotnull;

  SELECT pg_get_expr(default_state.adbin, default_state.adrelid)
    INTO desktop_default
    FROM pg_attribute attribute_state
    JOIN pg_attrdef default_state
      ON default_state.adrelid = attribute_state.attrelid
     AND default_state.adnum = attribute_state.attnum
   WHERE attribute_state.attrelid = settings_oid
     AND attribute_state.attname = 'reading_size_desktop'
     AND attribute_state.atttypid = 'text'::regtype
     AND attribute_state.attnotnull;

  SELECT pg_get_constraintdef(constraint_state.oid), constraint_state.convalidated
    INTO phone_constraint, phone_constraint_validated
    FROM pg_constraint constraint_state
   WHERE constraint_state.conrelid = settings_oid
     AND constraint_state.conname = 'user_settings_reading_size_phone_check'
     AND constraint_state.contype = 'c';

  SELECT pg_get_constraintdef(constraint_state.oid), constraint_state.convalidated
    INTO desktop_constraint, desktop_constraint_validated
    FROM pg_constraint constraint_state
   WHERE constraint_state.conrelid = settings_oid
     AND constraint_state.conname = 'user_settings_reading_size_desktop_check'
     AND constraint_state.contype = 'c';

  IF phone_default IS DISTINCT FROM '''normal''::text'
     OR desktop_default IS DISTINCT FROM '''normal''::text'
     OR phone_constraint IS DISTINCT FROM
       'CHECK ((reading_size_phone = ANY (ARRAY[''normal''::text, ''large''::text, ''largest''::text])))'
     OR phone_constraint_validated IS DISTINCT FROM true
     OR desktop_constraint IS DISTINCT FROM
       'CHECK ((reading_size_desktop = ANY (ARRAY[''normal''::text, ''large''::text, ''largest''::text])))'
     OR desktop_constraint_validated IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retained-reading-size-contract';
  END IF;
END
$retained_reading_size$;

COMMIT;
