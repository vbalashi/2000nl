-- Keep prior scheduler checks and verify the additive server-latched session
-- membership contract.
\i db/deploy-contract/postflight-132.sql

DO $$
DECLARE
  required regprocedure;
BEGIN
  FOREACH required IN ARRAY ARRAY[
    to_regprocedure('public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)'),
    to_regprocedure('public.get_training_session_snapshot(uuid,uuid)'),
    to_regprocedure('private.prevent_training_membership_identity_update_v1()')
  ] LOOP
    IF required IS NULL THEN
      RAISE EXCEPTION 'required migration 133 function is missing';
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'authenticated',
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'training session start privileges are incorrect';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.get_training_session_snapshot(uuid,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_training_session_snapshot(uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'training session snapshot privileges are incorrect';
  END IF;
END;
$$;
