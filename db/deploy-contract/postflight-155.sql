-- Verify the idiom exercise consumer after migration 155.
\i db/deploy-contract/postflight-154.sql

BEGIN;

DO $postflight_idiom_session_consumer$
DECLARE
    v_definition text;
    v_constraint text;
    v_function regprocedure;
    v_missing text[] := ARRAY[]::text[];
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'training_sessions'
           AND column_name = 'exercise_family'
           AND is_nullable = 'NO'
    ) THEN
        v_missing := v_missing || 'training_sessions.exercise_family';
    END IF;

    SELECT pg_get_constraintdef(oid)
      INTO v_constraint
      FROM pg_constraint
     WHERE conrelid = 'public.training_sessions'::regclass
       AND conname = 'training_sessions_exercise_family_check';
    IF v_constraint IS NULL
       OR v_constraint !~ $$'meaning'$$
       OR v_constraint !~ $$'idiom'$$
       OR v_constraint !~ $$'translation'$$ THEN
        v_missing := v_missing || 'training-session-family-check';
    END IF;

    IF to_regclass('public.training_exercise_run_start_receipts') IS NULL THEN
        v_missing := v_missing || 'idiom-session-start-receipts';
    ELSE
        IF NOT (
            SELECT relrowsecurity
              FROM pg_class
             WHERE oid = 'public.training_exercise_run_start_receipts'::regclass
        ) THEN
            v_missing := v_missing || 'idiom-session-start-receipts-rls';
        END IF;
        IF has_table_privilege('public', 'public.training_exercise_run_start_receipts', 'select')
           OR has_table_privilege('anon', 'public.training_exercise_run_start_receipts', 'select')
           OR has_table_privilege('authenticated', 'public.training_exercise_run_start_receipts', 'select')
           OR has_table_privilege('service_role', 'public.training_exercise_run_start_receipts', 'select') THEN
            v_missing := v_missing || 'idiom-session-start-receipts-privileges';
        END IF;
    END IF;

    FOR v_function IN
        SELECT to_regprocedure(fn)
          FROM unnest(ARRAY[
              'private.training_idiom_session_response_v1(uuid,uuid)',
              'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)',
              'private.consume_platform_v2_training_exercise_session_member_v1(uuid,uuid,uuid)',
              'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid)',
              'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,text,uuid,jsonb)',
              'public.read_platform_v2_idiom_training_session_snapshot(uuid,uuid)',
              'public.read_platform_v2_idiom_training_session_next(uuid,uuid)',
              'public.mark_platform_v2_idiom_training_session_member_unavailable(uuid,uuid,uuid,text)',
              'public.reconcile_platform_v2_idiom_receipt_as_principal(uuid,uuid)'
          ]) AS functions(fn)
    LOOP
        IF v_function IS NULL THEN
            v_missing := v_missing || 'idiom-session-function';
        END IF;
    END LOOP;

    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed idiom-session-consumer %',
            array_to_string(v_missing, ',');
    END IF;

    FOR v_function IN
        SELECT to_regprocedure(fn)
          FROM unnest(ARRAY[
              'private.training_idiom_session_response_v1(uuid,uuid)',
              'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)',
              'private.consume_platform_v2_training_exercise_session_member_v1(uuid,uuid,uuid)',
              'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid)',
              'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,text,uuid,jsonb)',
              'public.read_platform_v2_idiom_training_session_snapshot(uuid,uuid)',
              'public.read_platform_v2_idiom_training_session_next(uuid,uuid)',
              'public.mark_platform_v2_idiom_training_session_member_unavailable(uuid,uuid,uuid,text)',
              'public.reconcile_platform_v2_idiom_receipt_as_principal(uuid,uuid)'
          ]) AS functions(fn)
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_proc
             WHERE oid = v_function
               AND prosecdef
               AND (
                   'search_path=public, private, extensions, pg_temp' = ANY(proconfig)
                   OR 'search_path=public, private, pg_temp' = ANY(proconfig)
               )
        ) THEN
            RAISE EXCEPTION
                'db-contract-gate: postflight-failed idiom-session-security %',
                v_function;
        END IF;
    END LOOP;

    SELECT pg_get_functiondef(
        'private.start_platform_v2_idiom_training_session_v1(uuid,text,text,uuid)'::regprocedure
    ) INTO v_definition;
    IF v_definition !~* 'training_exercise_run_start_receipts'
       OR v_definition !~* 'training-active-run'
       OR v_definition !~* 'platform_v2_idiom_exercise_candidates_v1'
       OR v_definition !~* 'exercise_family' THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed idiom-session-start-contract';
    END IF;

    SELECT pg_get_functiondef(
        'public.read_platform_v2_idiom_training_session_next(uuid,uuid)'::regprocedure
    ) INTO v_definition;
    IF v_definition !~* 'status.*unavailable'
       OR v_definition !~* 'projection-missing'
       OR v_definition !~* 'training_active_runs' THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed idiom-session-next-contract';
    END IF;

    SELECT pg_get_functiondef(
        'private.consume_platform_v2_training_exercise_session_member_v1(uuid,uuid,uuid)'::regprocedure
    ) INTO v_definition;
    IF v_definition !~* 'family_mismatch'
       OR v_definition !~* 'training_exercise_session_member_out_of_order' THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed idiom-session-family-fence';
    END IF;

    IF NOT has_function_privilege(
        'authenticated',
        'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid)',
        'execute'
    )
    OR NOT has_function_privilege(
        'authenticated',
        'public.read_platform_v2_idiom_training_session_snapshot(uuid,uuid)',
        'execute'
    )
    OR NOT has_function_privilege(
        'authenticated',
        'public.read_platform_v2_idiom_training_session_next(uuid,uuid)',
        'execute'
    )
    OR NOT has_function_privilege(
        'authenticated',
        'public.mark_platform_v2_idiom_training_session_member_unavailable(uuid,uuid,uuid,text)',
        'execute'
    )
    OR has_function_privilege(
        'anon',
        'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid)',
        'execute'
    )
    OR has_function_privilege(
        'service_role',
        'public.start_platform_v2_idiom_training_session(uuid,text,text,uuid)',
        'execute'
    )
    OR NOT has_function_privilege(
        'service_role',
        'public.reconcile_platform_v2_idiom_receipt_as_principal(uuid,uuid)',
        'execute'
    )
    OR NOT has_function_privilege(
        'service_role',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,text,uuid,jsonb)',
        'execute'
    )
    OR has_function_privilege(
        'authenticated',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,text,uuid,jsonb)',
        'execute'
    )
    OR has_function_privilege(
        'authenticated',
        'public.reconcile_platform_v2_idiom_receipt_as_principal(uuid,uuid)',
        'execute'
    ) THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed idiom-session-grants';
    END IF;
END
$postflight_idiom_session_consumer$;

COMMIT;
