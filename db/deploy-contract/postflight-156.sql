-- Verify the explicit per-session ordinary Training rhythm contract.
\i db/deploy-contract/postflight-155.sql

BEGIN;

DO $postflight_session_rhythm$
DECLARE
  v_signature text;
  v_definition text;
  v_names text[];
  v_constraint text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_sessions'
      AND column_name = 'new_review_ratio'
      AND data_type = 'integer'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-column';
  END IF;

  SELECT pg_get_constraintdef(oid)
  INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.training_sessions'::regclass
    AND conname = 'training_sessions_new_review_ratio_check'
    AND contype = 'c'
    AND convalidated;
  IF v_constraint IS NULL
     OR v_constraint !~ 'new_review_ratio'
     OR v_constraint !~ '1'
     OR v_constraint !~ '5' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-check';
  END IF;

  -- The 6/7-argument plan and 7/8-argument start shapes remain available to
  -- older app images and cached browser bundles. The new shapes are distinct
  -- by arity and by the named p_new_review_ratio argument.
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)',
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)',
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)',
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid)',
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)',
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)',
    'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
    'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
    'private.claim_training_session_start_v1(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)',
    'private.mark_training_session_member_unavailable_latch_v1(uuid,uuid,uuid,text,text)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION
        'db-contract-gate: postflight-failed session-rhythm-signature %',
        v_signature;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE oid = to_regprocedure(v_signature)
        AND prosecdef
        AND pg_get_userbyid(proowner) = 'postgres'
        AND (
          'search_path=public, private, pg_temp' = ANY(proconfig)
          OR 'search_path=public, private, extensions, pg_temp' = ANY(proconfig)
        )
    ) THEN
      RAISE EXCEPTION
        'db-contract-gate: postflight-failed session-rhythm-security %',
        v_signature;
    END IF;
  END LOOP;

  SELECT proargnames INTO v_names
  FROM pg_proc
  WHERE oid = 'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure;
  IF v_names[8] IS DISTINCT FROM 'p_new_review_ratio' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-plan-name';
  END IF;
  SELECT proargnames INTO v_names
  FROM pg_proc
  WHERE oid = 'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)'::regprocedure;
  IF v_names[8] IS DISTINCT FROM 'p_request_id'
     OR v_names[9] IS DISTINCT FROM 'p_new_review_ratio' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-start-names';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid IN (
      'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure,
      'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)'::regprocedure
    )
      AND pronargdefaults <> 0
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-overload-defaults';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)',
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_signature, 'execute')
       OR has_function_privilege('anon', v_signature, 'execute')
       OR has_function_privilege('service_role', v_signature, 'execute') THEN
      RAISE EXCEPTION
        'db-contract-gate: postflight-failed session-rhythm-public-grant %',
        v_signature;
    END IF;
  END LOOP;
  FOREACH v_signature IN ARRAY ARRAY[
    'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
    'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)',
    'private.claim_training_session_start_v1(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)',
    'private.mark_training_session_member_unavailable_latch_v1(uuid,uuid,uuid,text,text)'
  ] LOOP
    IF has_function_privilege('anon', v_signature, 'execute')
       OR has_function_privilege('authenticated', v_signature, 'execute')
       OR has_function_privilege('service_role', v_signature, 'execute') THEN
      RAISE EXCEPTION
        'db-contract-gate: postflight-failed session-rhythm-private-grant %',
        v_signature;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'p_new_review_ratio'
     OR v_definition !~ 'training_session_members_v1' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-preview-routing';
  END IF;

  SELECT pg_get_functiondef(
    'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'p_new_review_ratio'
     OR v_definition ~* 'user_settings' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-queue-routing';
  END IF;

  SELECT pg_get_functiondef(
    'private.start_training_session_latch_v1(uuid,text[],uuid,text,text,jsonb,text,integer)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'new_review_ratio'
     OR v_definition !~ 'training_session_members_v1' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-latch-routing';
  END IF;

  SELECT pg_get_functiondef(
    'private.claim_training_session_start_v1(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'newReviewRatio'
     OR v_definition !~ 'training_run_start_receipts'
     OR v_definition !~ 'start_training_session_latch_v1' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-idempotency-routing';
  END IF;

  SELECT pg_get_functiondef(
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid,integer)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'claim_training_session_start_v1'
     OR v_definition !~ 'p_new_review_ratio' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-public-start-routing';
  END IF;

  SELECT pg_get_functiondef(
    'private.mark_training_session_member_unavailable_latch_v1(uuid,uuid,uuid,text,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition !~ 'v_session.new_review_ratio' THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed session-rhythm-replacement-routing';
  END IF;
END
$postflight_session_rhythm$;

COMMIT;
