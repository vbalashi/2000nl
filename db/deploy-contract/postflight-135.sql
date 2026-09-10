-- Keep all prior checks and require the exclusion-aware session selector.
\i db/deploy-contract/postflight-134.sql

DO $$
BEGIN
  IF to_regprocedure('public.get_next_training_session_card(uuid,uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'required migration 135 selector overload is missing';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.get_next_training_session_card(uuid,uuid,text[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_next_training_session_card(uuid,uuid,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'exclusion-aware selector privileges are incorrect';
  END IF;
END;
$$;
