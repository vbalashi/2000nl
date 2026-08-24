BEGIN;
-- Make this an eligibility contract instead of a cost-model lottery on a
-- small or freshly restored database. Sequential scans remain available to
-- the outer relation, but the pointer-only inner relation must be indexable.
SET LOCAL enable_seqscan = off;

DO $postflight$
DECLARE
  scheduler_oid regprocedure := to_regprocedure(
    'private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean)'
  );
  scheduler_definition text;
  scheduler_definition_upper text;
  scheduler_access_call_count integer;
  scheduler_plan jsonb;
  scheduler_plan_text text;
BEGIN
  IF to_regprocedure(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)'
  ) IS NULL OR to_regprocedure(
    'public.get_recent_training_review_history(integer)'
  ) IS NULL OR scheduler_oid IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed rpc-signatures';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.get_recent_training_review_history(integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_recent_training_review_history(integer)',
    'EXECUTE'
  ) OR has_function_privilege('service_role', scheduler_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed grants';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_state
    JOIN pg_class index_relation ON index_relation.oid = index_state.indexrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = 'word_entries_pointer_only_scheduler_exclusion_v1_idx'
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed scheduler-index';
  END IF;

  scheduler_definition := pg_get_functiondef(scheduler_oid);
  scheduler_definition_upper := upper(scheduler_definition);
  IF position('NOT EXISTS' IN scheduler_definition_upper) = 0
     OR position(
       'PRIVATE.IS_POINTER_ONLY_DICTIONARY_ENTRY_V1' IN scheduler_definition_upper
     ) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed scheduler-plan-contract';
  END IF;

  scheduler_access_call_count := (
    length(scheduler_definition_upper) - length(replace(
      scheduler_definition_upper,
      'CAN_ACCESS_DICTIONARY(',
      ''
    ))
  ) / length('CAN_ACCESS_DICTIONARY(');
  IF position(
       'READABLE_DICTIONARIES AS MATERIALIZED' IN scheduler_definition_upper
     ) = 0
     OR position(
       'WHERE CAN_ACCESS_DICTIONARY(P_USER_ID,DICTIONARY.ID,''READ'')'
       IN scheduler_definition_upper
     ) = 0
     OR position(
       'LEFT JOIN READABLE_DICTIONARIES READABLE_DICTIONARY'
       IN scheduler_definition_upper
     ) = 0
     OR scheduler_access_call_count <> 1 THEN
    RAISE EXCEPTION
      'db-contract-gate: postflight-failed scheduler-dictionary-access-contract';
  END IF;

  -- PostgreSQL does not expose an SQL function's inlined inner plan through a
  -- stable public API. The definition check above binds the scheduler to this
  -- exact anti-join predicate; this representative EXPLAIN then proves that
  -- the predicate produces an Anti join whose inner side uses the contracted
  -- partial index.
  EXECUTE $scheduler_explain$
    EXPLAIN (FORMAT JSON, COSTS OFF)
    SELECT entry.id
    FROM public.word_entries AS entry
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.word_entries AS pointer_entry
      WHERE pointer_entry.id = entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
  $scheduler_explain$
  INTO scheduler_plan;
  scheduler_plan_text := scheduler_plan::text;

  IF position('"Join Type": "Anti"' IN scheduler_plan_text) = 0
     OR position(
       '"Index Name": "word_entries_pointer_only_scheduler_exclusion_v1_idx"'
       IN scheduler_plan_text
     ) = 0 THEN
    RAISE EXCEPTION
      'db-contract-gate: postflight-failed scheduler-explain-contract';
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
