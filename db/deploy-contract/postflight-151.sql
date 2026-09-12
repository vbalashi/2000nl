-- Verify the additive content-bound Training Exercise contract after migration 151.
\i db/deploy-contract/postflight-150.sql

BEGIN;

DO $postflight_content_bound_exercises$
DECLARE
    v_missing text[] := ARRAY[]::text[];
BEGIN
    IF to_regclass('private.platform_v2_training_exercise_targets') IS NULL THEN
        v_missing := v_missing || 'target-table';
    END IF;
    IF to_regclass('public.user_training_exercise_state') IS NULL THEN
        v_missing := v_missing || 'state-table';
    END IF;
    IF to_regclass('public.training_session_exercise_members') IS NULL THEN
        v_missing := v_missing || 'session-table';
    END IF;
    IF to_regclass('public.user_training_exercise_action_events') IS NULL THEN
        v_missing := v_missing || 'action-table';
    END IF;
    IF to_regclass('public.platform_v2_training_exercise_action_receipts') IS NULL THEN
        v_missing := v_missing || 'receipt-table';
    END IF;
    IF to_regprocedure(
        'private.ensure_platform_v2_training_exercise_target_v1(uuid,uuid,text,text,text,text)'
    ) IS NULL THEN
        v_missing := v_missing || 'target-registration-function';
    END IF;
    IF to_regprocedure(
        'public.ensure_platform_v2_training_exercise_target_as_principal_v1(uuid,uuid,text,text,text,text)'
    ) IS NULL THEN
        v_missing := v_missing || 'target-registration-wrapper';
    END IF;
    IF to_regprocedure(
        'public.read_platform_v2_training_exercise_target_v1(uuid,text)'
    ) IS NULL THEN
        v_missing := v_missing || 'target-read-function';
    END IF;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed content-bound-exercise-contract %',
            array_to_string(v_missing, ',');
    END IF;

    IF NOT has_table_privilege(
        'authenticated',
        'public.user_training_exercise_state',
        'select'
    )
    OR has_table_privilege(
        'anon',
        'public.user_training_exercise_state',
        'select'
    ) THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed content-bound-exercise-rls';
    END IF;
END
$postflight_content_bound_exercises$;

COMMIT;
