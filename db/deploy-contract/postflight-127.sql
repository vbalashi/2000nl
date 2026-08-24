BEGIN;
-- Make index eligibility deterministic on empty and freshly restored databases.
SET LOCAL enable_seqscan = off;

DO $postflight$
DECLARE
  scheduler_oid regprocedure := to_regprocedure(
    'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean)'
  );
  counts_oid regprocedure := to_regprocedure(
    'private.default_training_session_plan_counts_v1(uuid,text[],text,text,jsonb)'
  );
  plan_oid regprocedure := to_regprocedure(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)'
  );
  scheduler_definition text;
  counts_definition text;
  plan_definition text;
  scheduler_access_call_count integer;
  scope_plan jsonb;
  scope_plan_text text;
BEGIN
  IF scheduler_oid IS NULL OR counts_oid IS NULL OR plan_oid IS NULL
     OR to_regprocedure('public.get_recent_training_review_history(integer)') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed rpc-signatures';
  END IF;

  IF NOT has_function_privilege('authenticated', plan_oid, 'EXECUTE')
     OR has_function_privilege('anon', plan_oid, 'EXECUTE')
     OR has_function_privilege('service_role', counts_oid, 'EXECUTE')
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
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_index index_state
    JOIN pg_class index_relation ON index_relation.oid = index_state.indexrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'word_entries_nt2_scheduler_scope_v1_idx'
      AND index_state.indisvalid AND index_state.indisready
      AND index_state.indpred IS NOT NULL
      AND position('dictionary_id' IN pg_get_indexdef(index_state.indexrelid)) > 0
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
  plan_definition := upper(pg_get_functiondef(plan_oid));
  IF position('LIMITS AS MATERIALIZED' IN counts_definition) = 0
     OR position('READABLE_DICTIONARIES AS MATERIALIZED' IN counts_definition) = 0
     OR position('LEARNER_STATUS AS MATERIALIZED' IN counts_definition) = 0
     OR position('WORD_ENTRIES_NT2_SCHEDULER_SCOPE_V1_IDX' IN upper(
       pg_get_indexdef('public.word_entries_nt2_scheduler_scope_v1_idx'::regclass)
     )) = 0
     OR position('DEFAULT_TRAINING_SESSION_PLAN_COUNTS_V1' IN plan_definition) = 0
     OR position('TRAINING_SCHEDULER_CANDIDATES_V1' IN plan_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed bounded-plan-contract';
  END IF;

  EXECUTE $scope_explain$
    EXPLAIN (FORMAT JSON, COSTS OFF)
    SELECT entry.id, entry.dictionary_id
    FROM public.word_entries entry
    WHERE entry.is_nt2_2000 = true
      AND NOT private.is_pointer_only_dictionary_entry_v1(entry.raw)
  $scope_explain$
  INTO scope_plan;
  scope_plan_text := scope_plan::text;
  IF position('"Node Type": "Index Only Scan"' IN scope_plan_text) = 0
     OR position(
       '"Index Name": "word_entries_nt2_scheduler_scope_v1_idx"' IN scope_plan_text
     ) = 0 THEN
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
