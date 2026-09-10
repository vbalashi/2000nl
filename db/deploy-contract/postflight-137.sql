-- Keep all prior checks and prove the scheduler compatibility overloads are
-- gone after the repository caller migration.
\i db/deploy-contract/postflight-136.sql

DO $$
BEGIN
  IF to_regprocedure('public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[],boolean)') IS NULL
     OR to_regprocedure('public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'explicit practice-aware scheduler functions are missing';
  END IF;

  IF to_regprocedure('public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])') IS NOT NULL
     OR to_regprocedure('public.get_next_card_without_known(uuid,text[],uuid[],uuid,text,text,text,text[])') IS NOT NULL
     OR to_regprocedure('public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)') IS NOT NULL
     OR to_regprocedure('public.get_next_filtered_card_without_known(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy scheduler overloads remain after migration 137';
  END IF;
END;
$$;
