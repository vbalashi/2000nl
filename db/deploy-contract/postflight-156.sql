-- Verify the sentence-translation exercise consumer after migration 156.
\i db/deploy-contract/postflight-155.sql

BEGIN;

DO $postflight_translation_session_consumer$
DECLARE
    v_function regprocedure;
    v_missing text[] := ARRAY[]::text[];
BEGIN
    FOR v_function IN
        SELECT to_regprocedure(fn)
          FROM unnest(ARRAY[
              'private.platform_v2_translation_exercise_candidates_v1(uuid,integer,integer)',
              'public.read_platform_v2_translation_candidates_as_principal_v1(uuid,integer,integer)',
              'private.training_translation_session_response_v1(uuid,uuid)',
              'private.start_platform_v2_translation_training_session_v1(uuid,text,uuid)',
              'public.start_platform_v2_translation_training_session(uuid,text,uuid)',
              'public.perform_platform_v2_translation_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,text,uuid,jsonb)',
              'public.read_platform_v2_translation_training_session_snapshot(uuid,uuid)',
              'public.read_platform_v2_translation_training_session_next(uuid,uuid)',
              'public.mark_platform_v2_translation_session_member_unavailable(uuid,uuid,uuid,text)',
              'public.reconcile_platform_v2_translation_receipt_as_principal(uuid,uuid)'
          ]) AS functions(fn)
    LOOP
        IF v_function IS NULL THEN v_missing := v_missing || 'translation-session-function'; END IF;
    END LOOP;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed translation-session-consumer %',
            array_to_string(v_missing, ',');
    END IF;
    IF NOT has_function_privilege(
        'authenticated',
        'public.start_platform_v2_translation_training_session(uuid,text,uuid)',
        'execute'
    ) OR NOT has_function_privilege(
        'authenticated',
        'public.read_platform_v2_translation_training_session_next(uuid,uuid)',
        'execute'
    ) OR NOT has_function_privilege(
        'service_role',
        'public.perform_platform_v2_translation_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,text,uuid,jsonb)',
        'execute'
    ) THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed translation-session-grants';
    END IF;
END
$postflight_translation_session_consumer$;

COMMIT;
