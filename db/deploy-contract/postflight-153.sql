-- Verify the one-active-run authority after migration 153.
\i db/deploy-contract/postflight-152.sql

BEGIN;

DO $postflight_active_training_run$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_table text;
  v_role text;
  v_privilege text;
  v_rls_enabled boolean;
  v_non_session_definition text;
  v_session_definition text;
BEGIN
  IF to_regclass('public.training_active_runs') IS NULL THEN
    v_missing := v_missing || 'active-run-table';
  END IF;
  IF to_regclass('public.training_run_start_receipts') IS NULL THEN
    v_missing := v_missing || 'start-receipt-table';
  END IF;
  IF to_regprocedure('private.require_active_training_session_v1(uuid,uuid)') IS NULL THEN
    v_missing := v_missing || 'active-run-guard';
  END IF;
  IF to_regprocedure('public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid)') IS NULL THEN
    v_missing := v_missing || 'idempotent-start';
  END IF;
  IF to_regprocedure('private.perform_platform_v2_card_action_non_session_latch_v1(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)') IS NULL THEN
    v_missing := v_missing || 'non-session-action-latch';
  END IF;
  IF to_regprocedure('public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)') IS NULL THEN
    v_missing := v_missing || 'guarded-non-session-action';
  END IF;
  IF to_regprocedure('public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)') IS NULL THEN
    v_missing := v_missing || 'session-aware-action';
  END IF;
  IF to_regprocedure('public.handle_card_review(uuid,uuid,text,text,uuid)') IS NULL THEN
    v_missing := v_missing || 'internal-legacy-review';
  END IF;
  IF to_regprocedure('public.start_learning_entry_card(uuid,uuid,text)') IS NULL THEN
    v_missing := v_missing || 'internal-legacy-learn';
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'db-contract-gate: postflight-failed active-training-run %',
      array_to_string(v_missing, ',');
  END IF;
  IF has_function_privilege(
    'authenticated',
    'private.require_active_training_session_v1(uuid,uuid)',
    'execute'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed active-training-run-guard-grant';
  END IF;

  IF to_regprocedure('public.handle_review(uuid,uuid,text,text,uuid)') IS NOT NULL
     OR to_regprocedure('public.start_learning_card(uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed retired-legacy-training-alias';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'service_role'] LOOP
    IF has_function_privilege(
      v_role,
      'public.handle_card_review(uuid,uuid,text,text,uuid)',
      'execute'
    ) OR has_function_privilege(
      v_role,
      'public.start_learning_entry_card(uuid,uuid,text)',
      'execute'
    ) THEN
      RAISE EXCEPTION
        'db-contract-gate: postflight-failed direct-legacy-training-grant-%',
        v_role;
    END IF;
  END LOOP;
  IF NOT has_function_privilege(
    'authenticated',
    'public.handle_card_review(uuid,uuid,text,text,uuid)',
    'execute'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.start_learning_entry_card(uuid,uuid,text)',
    'execute'
  ) THEN
    RAISE EXCEPTION
      'db-contract-gate: postflight-failed legacy-first-party-rollback-grant';
  END IF;

  SELECT pg_get_functiondef(
           'public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)'::regprocedure
         )
    INTO v_non_session_definition;
  IF v_non_session_definition !~* $$p_auth_kind\s+not\s+in\s+\('first_party',\s*'connected_client'\)$$
     OR v_non_session_definition ~* 'training_session_members'
     OR v_non_session_definition ~* 'training_active_runs' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed ambiguous-non-session-action-routing';
  END IF;

  SELECT pg_get_functiondef(
           'public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)'::regprocedure
         )
    INTO v_session_definition;
  IF v_session_definition !~* 'require_active_training_session_v1'
     OR v_session_definition !~* 'p_training_session_id\s+is\s+null' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed explicit-training-library-routing';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'training_active_runs',
    'training_run_start_receipts'
  ] LOOP
    SELECT c.relrowsecurity
      INTO v_rls_enabled
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = v_table;
    IF v_rls_enabled IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        'db-contract-gate: postflight-failed active-training-run-rls-%',
        v_table;
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
        'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ] LOOP
        IF has_table_privilege(
          v_role,
          format('public.%I', v_table),
          v_privilege
        ) THEN
          RAISE EXCEPTION
            'db-contract-gate: postflight-failed active-training-run-table-grant-%-%-%',
            v_table,
            v_role,
            lower(v_privilege);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$postflight_active_training_run$;

COMMIT;
