-- Keep the previous contract checks and verify the action-budget session seam.
\i db/deploy-contract/postflight-138.sql

DO $$
BEGIN
  IF to_regprocedure(
       'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
     ) IS NULL
     OR to_regprocedure(
       'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'session action-budget scheduler functions are missing';
  END IF;

  IF to_regprocedure('public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('public.get_training_session_snapshot(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'session action-budget public contract is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns column_row
    WHERE table_schema = 'public'
      AND table_name = 'training_sessions'
      AND column_name = 'requested_total'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'training session requested_total is missing or nullable';
  END IF;
END;
$$;
