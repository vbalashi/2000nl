-- Verify the additive idiom exercise runtime boundary after migration 152.
\i db/deploy-contract/postflight-151.sql

BEGIN;

DO $postflight_idiom_exercise_runtime$
DECLARE
    v_missing text[] := ARRAY[]::text[];
    v_function regprocedure;
    v_definition text;
    v_constraint text;
BEGIN
    IF to_regprocedure(
        'private.platform_v2_idiom_exercise_candidates_v1(uuid,text,integer,integer)'
    ) IS NULL THEN
        v_missing := v_missing || 'idiom-candidate-function';
    END IF;
    IF to_regprocedure(
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)'
    ) IS NULL THEN
        v_missing := v_missing || 'idiom-candidate-wrapper';
    END IF;
    IF to_regprocedure(
        'private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)'
    ) IS NULL THEN
        v_missing := v_missing || 'idiom-action-function';
    END IF;
    IF to_regprocedure(
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)'
    ) IS NULL THEN
        v_missing := v_missing || 'idiom-action-wrapper';
    END IF;

    SELECT pg_get_constraintdef(oid)
      INTO v_constraint
      FROM pg_constraint
     WHERE conrelid = 'public.user_training_exercise_action_events'::regclass
       AND conname = 'user_training_exercise_action_events_action_check';
    IF position('review-exercise' IN COALESCE(v_constraint, '')) = 0 THEN
        v_missing := v_missing || 'review-exercise-action-check';
    END IF;

    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed idiom-exercise-runtime %',
            array_to_string(v_missing, ',');
    END IF;

    FOR v_function IN
        SELECT fn::regprocedure
          FROM unnest(ARRAY[
              'private.platform_v2_idiom_exercise_candidates_v1(uuid,text,integer,integer)',
              'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
              'private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
              'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)'
          ]) AS functions(fn)
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM pg_proc
             WHERE oid = v_function
               AND prosecdef
               AND 'search_path=public, private, extensions, pg_temp' = ANY(proconfig)
        ) THEN
            RAISE EXCEPTION
                'db-contract-gate: postflight-failed idiom-exercise-security %',
                v_function;
        END IF;
    END LOOP;

    IF NOT has_function_privilege(
        'service_role',
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
        'execute'
    )
    OR has_function_privilege(
        'authenticated',
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
        'execute'
    )
    OR has_function_privilege(
        'anon',
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
        'execute'
    )
    OR NOT has_function_privilege(
        'service_role',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
        'execute'
    )
    OR has_function_privilege(
        'authenticated',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
        'execute'
    )
    OR has_function_privilege(
        'anon',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
        'execute'
    ) THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed idiom-exercise-grants';
    END IF;
END
$postflight_idiom_exercise_runtime$;

COMMIT;
