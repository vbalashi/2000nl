-- Keep all prior scheduler/session checks and verify session-scoped selection
-- plus atomic membership consumption at the Platform action boundary.
\i db/deploy-contract/postflight-133.sql

DO $$
DECLARE
  required regprocedure;
BEGIN
  FOREACH required IN ARRAY ARRAY[
    to_regprocedure('public.get_next_training_session_card(uuid,uuid)'),
    to_regprocedure('private.consume_training_session_member(uuid,uuid,uuid,text)'),
    to_regprocedure('public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)')
  ] LOOP
    IF required IS NULL THEN
      RAISE EXCEPTION 'required migration 134 function is missing';
    END IF;
  END LOOP;

  IF NOT has_function_privilege(
    'authenticated',
    'public.get_next_training_session_card(uuid,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_next_training_session_card(uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'session card selector privileges are incorrect';
  END IF;

  IF to_regprocedure('public.consume_training_session_member(uuid,uuid,uuid,text)') IS NOT NULL
     OR has_function_privilege(
       'authenticated',
       'private.consume_training_session_member(uuid,uuid,uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'session member consumer must remain private';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.perform_platform_v2_card_action_as_principal(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'session action boundary privileges are incorrect';
  END IF;
END;
$$;
