BEGIN;

DO $postflight$
DECLARE
  scheduler_oid regprocedure := to_regprocedure(
    'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean)'
  );
  counts_oid regprocedure := to_regprocedure(
    'private.default_training_session_plan_counts_v1(uuid,text[],text,text,jsonb)'
  );
  sync_oid regprocedure := to_regprocedure(
    'private.sync_default_training_scope_entry_v1()'
  );
  plan_oid regprocedure := to_regprocedure(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)'
  );
  scheduler_definition text;
  counts_definition text;
  sync_definition text;
  plan_definition text;
  scheduler_access_call_count integer;
  scope_plan jsonb;
  scope_plan_text text;
BEGIN
  IF scheduler_oid IS NULL OR counts_oid IS NULL OR sync_oid IS NULL OR plan_oid IS NULL
     OR to_regclass('private.default_training_scope_entries_v1') IS NULL
     OR to_regprocedure('public.get_recent_training_review_history(integer)') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed rpc-signatures';
  END IF;

  IF NOT has_function_privilege('authenticated', plan_oid, 'EXECUTE')
     OR has_function_privilege('anon', plan_oid, 'EXECUTE')
     OR has_function_privilege('service_role', counts_oid, 'EXECUTE')
     OR has_function_privilege('service_role', sync_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', sync_oid, 'EXECUTE')
     OR has_function_privilege('anon', sync_oid, 'EXECUTE')
     OR has_function_privilege('service_role', scheduler_oid, 'EXECUTE')
     OR NOT has_function_privilege(
       'authenticated', 'public.get_recent_training_review_history(integer)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed grants';
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
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed scheduler-index';
  END IF;

  scheduler_definition := upper(pg_get_functiondef(scheduler_oid));
  scheduler_access_call_count := (
    length(scheduler_definition) - length(replace(
      scheduler_definition, 'CAN_ACCESS_DICTIONARY(', ''
    ))
  ) / length('CAN_ACCESS_DICTIONARY(');
  IF position('READABLE_DICTIONARIES AS MATERIALIZED' IN scheduler_definition) = 0
     OR position('LEFT JOIN READABLE_DICTIONARIES READABLE_DICTIONARY' IN scheduler_definition) = 0
     OR scheduler_access_call_count <> 1 THEN
    RAISE EXCEPTION
      'db-contract-gate: postflight-failed scheduler-dictionary-access-contract';
  END IF;

  counts_definition := upper(pg_get_functiondef(counts_oid));
  sync_definition := upper(pg_get_functiondef(sync_oid));
  plan_definition := upper(pg_get_functiondef(plan_oid));
  IF position('LIMITS AS MATERIALIZED' IN counts_definition) = 0
     OR position('READABLE_DICTIONARIES AS MATERIALIZED' IN counts_definition) = 0
     OR position('LEARNER_STATUS AS MATERIALIZED' IN counts_definition) = 0
     OR position('DEFAULT_TRAINING_SCOPE_ENTRIES_V1' IN counts_definition) = 0
     OR position('DEFAULT_TRAINING_SESSION_PLAN_COUNTS_V1' IN plan_definition) = 0
     OR position('TRAINING_SCHEDULER_CANDIDATES_V1' IN plan_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed bounded-plan-contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_state
    WHERE trigger_state.tgrelid = 'public.word_entries'::regclass
      AND trigger_state.tgname = 'sync_default_training_scope_entry_v1'
      AND trigger_state.tgfoid = sync_oid::oid
      AND trigger_state.tgtype = 21 -- AFTER, ROW, INSERT | UPDATE
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
    RAISE EXCEPTION 'db-contract-gate: postflight-failed bounded-scope-sync-contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc procedure_state
    WHERE procedure_state.oid = sync_oid::oid
      AND procedure_state.prosecdef
      AND procedure_state.provolatile = 'v'
      AND procedure_state.proconfig @> ARRAY['search_path=public, private, pg_temp']::text[]
  ) OR position('NEW.IS_NT2_2000 = TRUE' IN sync_definition) = 0
     OR position('PRIVATE.IS_POINTER_ONLY_DICTIONARY_ENTRY_V1(NEW.RAW)' IN sync_definition) = 0
     OR position('INSERT INTO PRIVATE.DEFAULT_TRAINING_SCOPE_ENTRIES_V1' IN sync_definition) = 0
     OR position('ON CONFLICT (ENTRY_ID) DO UPDATE' IN sync_definition) = 0
     OR position('DELETE FROM PRIVATE.DEFAULT_TRAINING_SCOPE_ENTRIES_V1' IN sync_definition) = 0 THEN
    RAISE EXCEPTION
      'db-contract-gate: postflight-failed bounded-scope-sync-function-contract';
  END IF;

  IF (
    SELECT array_agg(attribute.attname ORDER BY attribute.attnum)
    FROM pg_attribute attribute
    WHERE attribute.attrelid = 'private.default_training_scope_entries_v1'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) IS DISTINCT FROM ARRAY['entry_id', 'dictionary_id']::name[] THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed bounded-scope-shape-contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_state
    WHERE constraint_state.conrelid = 'private.default_training_scope_entries_v1'::regclass
      AND constraint_state.confrelid = 'public.word_entries'::regclass
      AND constraint_state.contype = 'f'
      AND constraint_state.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed bounded-scope-delete-contract';
  END IF;

  -- The projection is deliberately narrow enough for either a sequential or
  -- indexed scan; the contract is that the wide source heap is absent.
  EXECUTE $scope_explain$
    EXPLAIN (FORMAT JSON, COSTS OFF)
    SELECT scope_entry.entry_id, scope_entry.dictionary_id
    FROM private.default_training_scope_entries_v1 scope_entry
  $scope_explain$
  INTO scope_plan;
  scope_plan_text := scope_plan::text;
  IF position('"Relation Name": "default_training_scope_entries_v1"' IN scope_plan_text) = 0
     OR position('"Relation Name": "word_entries"' IN scope_plan_text) > 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed bounded-plan-explain-contract';
  END IF;

  IF to_regprocedure(
    'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])'
  ) IS NULL OR to_regprocedure(
    'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)'
  ) IS NULL OR NOT has_function_privilege(
    'authenticated',
    'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed app-compatibility';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.app_db_contract_state', 'SELECT')
     OR has_table_privilege('anon', 'public.app_db_contract_state', 'SELECT')
     OR has_table_privilege('authenticated', 'public.app_db_contract_state', 'SELECT') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed health-signal-grants';
  END IF;
END
$postflight$;

COMMIT;
