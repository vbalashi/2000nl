-- Verify the hardened content-bound exercise boundary after migration 154.
\i db/deploy-contract/postflight-153.sql

BEGIN;

DO $postflight_hardened_exercise_actions$
DECLARE
    v_missing text[] := ARRAY[]::text[];
    v_function regprocedure;
    v_definition text;
    authority oid;
    authority_definition text;
BEGIN
    FOR v_function IN
        SELECT to_regprocedure(fn)
          FROM unnest(ARRAY[
              'private.platform_v2_training_ordinary_meaning_eligible_v1(uuid,uuid)',
              'private.consume_platform_v2_training_exercise_session_member_v1(uuid,uuid,uuid)',
              'private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
              'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
              'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
              'public.read_platform_v2_training_exercise_target_v1(uuid,text)'
          ]) AS functions(fn)
    LOOP
        IF v_function IS NULL THEN
            v_missing := v_missing || 'function';
        END IF;
    END LOOP;

    IF to_regprocedure(
        'private.platform_v2_training_exercise_action_payload_v1(uuid,uuid,text,uuid,uuid,jsonb)'
    ) IS NULL THEN
        v_missing := v_missing || 'action-payload-canonicalizer';
    END IF;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed hardened-exercise-actions %',
            array_to_string(v_missing, ',');
    END IF;

    SELECT pg_get_functiondef(
        'private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)'::regprocedure
    ) INTO v_definition;
    IF v_definition !~* 'pg_advisory_xact_lock'
       OR v_definition !~* 'platform_v2_training_exercise_action_receipts'
       OR v_definition !~* 'require_active_training_session_v1'
       OR v_definition !~* 'consume_platform_v2_training_exercise_session_member_v1' THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed hardened-exercise-action-ordering';
    END IF;

    SELECT pg_get_functiondef(
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)'::regprocedure
    ) INTO v_definition;
    IF v_definition !~* $$queueSource.*new.*learning.*review$$ THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed future-practice-filter';
    END IF;

    SELECT pg_get_functiondef(
        'public.read_platform_v2_training_exercise_target_v1(uuid,text)'::regprocedure
    ) INTO v_definition;
    IF v_definition !~* 'visibility_state\s*=\s*''active'''
       OR v_definition !~* 'training_exercise_target_not_found'
       OR (v_definition !~* 'can_access_dictionary'
           AND strpos(v_definition,'private.entry_access_v1(p_user_id,entry.id,''train'')')=0) THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed target-read-fail-closed';
    END IF;

    -- New entry-level delegation must retain the original active/licence fence.
    -- A displayed-card permit must never authorize this general target reader.
    IF v_definition !~* 'can_access_dictionary' THEN
        authority:=to_regprocedure('private.entry_access_v1(uuid,uuid,text)');
        IF authority IS NULL THEN RAISE EXCEPTION 'db-contract-gate: missing target authority'; END IF;
        authority_definition:=pg_get_functiondef(authority);
        IF cardinality(string_to_array(v_definition,'private.entry_access_v1(p_user_id,entry.id,''train'')'))<>2
           OR v_definition ILIKE '%current_training_card%'
           OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=authority AND prosecdef AND provolatile='s'
             AND pg_get_userbyid(proowner)='postgres'
             AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])
           OR has_function_privilege('anon',authority,'EXECUTE')
           OR has_function_privilege('authenticated',authority,'EXECUTE')
           OR has_function_privilege('service_role',authority,'EXECUTE')
           OR strpos(authority_definition,'private.active_word_entries')=0
           OR strpos(authority_definition,'public.can_access_dictionary')=0
           OR strpos(authority_definition,'private.can_read_shared_author_entry_v1')=0
           OR strpos(authority_definition,'p_mode=''train''')=0 THEN
            RAISE EXCEPTION 'db-contract-gate: unsafe target authority';
        END IF;
    END IF;

    FOR v_function IN
        SELECT to_regprocedure(fn)
          FROM unnest(ARRAY[
              'private.consume_platform_v2_training_exercise_session_member_v1(uuid,uuid,uuid)',
              'private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
              'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
              'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
              'public.read_platform_v2_training_exercise_target_v1(uuid,text)'
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
                'db-contract-gate: postflight-failed hardened-exercise-security %',
                v_function;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_proc
         WHERE oid = 'private.platform_v2_training_ordinary_meaning_eligible_v1(uuid,uuid)'::regprocedure
           AND prosecdef
           AND 'search_path=public, private, pg_temp' = ANY(proconfig)
    ) THEN
        RAISE EXCEPTION
            'db-contract-gate: postflight-failed target-entry-eligibility-security';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
        'execute'
    )
    OR NOT has_function_privilege(
        'service_role',
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
        'execute'
    )
    OR NOT has_function_privilege(
        'service_role',
        'public.read_platform_v2_training_exercise_target_v1(uuid,text)',
        'execute'
    )
    OR has_function_privilege(
        'authenticated',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
        'execute'
    )
    OR has_function_privilege(
        'authenticated',
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
        'execute'
    )
    OR has_function_privilege(
        'authenticated',
        'public.read_platform_v2_training_exercise_target_v1(uuid,text)',
        'execute'
    )
    OR has_function_privilege(
        'anon',
        'public.perform_platform_v2_idiom_exercise_action_as_principal_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
        'execute'
    )
    OR has_function_privilege(
        'anon',
        'public.read_platform_v2_idiom_exercise_candidates_as_principal_v1(uuid,text,integer,integer)',
        'execute'
    )
    OR has_function_privilege(
        'anon',
        'public.read_platform_v2_training_exercise_target_v1(uuid,text)',
        'execute'
    ) THEN
        RAISE EXCEPTION 'db-contract-gate: postflight-failed hardened-exercise-grants';
    END IF;
END
$postflight_hardened_exercise_actions$;

COMMIT;
