-- Keep all prior checks and require explicit unavailable-member recovery.
\i db/deploy-contract/postflight-135.sql

DO $$
DECLARE
  selector_volatility "char";
BEGIN
  IF to_regprocedure('public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'required migration 136 unavailable-member function is missing';
  END IF;

  SELECT proc.provolatile INTO selector_volatility
  FROM pg_proc proc
  WHERE proc.oid = 'public.get_next_training_session_card(uuid,uuid,text[])'::regprocedure;
  IF selector_volatility IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION 'unavailable-member selector must be STABLE';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'unavailable-member function privileges are incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_session_members'
      AND column_name = 'unavailable_reason'
  ) THEN
    RAISE EXCEPTION 'training_session_members.unavailable_reason is missing';
  END IF;
END;
$$;
