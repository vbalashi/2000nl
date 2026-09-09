-- Keep the prior postflight checks and verify the finite-session overloads.
\i db/deploy-contract/postflight-131.sql

DO $$
DECLARE
  required_regprocedure regprocedure;
BEGIN
  FOREACH required_regprocedure IN ARRAY ARRAY[
    to_regprocedure('public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)'),
    to_regprocedure('public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)'),
    to_regprocedure('public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)'),
    to_regprocedure('private.training_scheduler_candidates_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)')
  ] LOOP
    IF required_regprocedure IS NULL THEN
      RAISE EXCEPTION 'required migration 132 function is missing';
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'authenticated',
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated cannot execute finite session plan function';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon can execute finite session plan function';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'finite get_next_card privileges are incorrect';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'finite get_next_filtered_card privileges are incorrect';
  END IF;
END;
$$;
