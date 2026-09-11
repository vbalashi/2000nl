-- Retain the scheduler checks and verify the entry-level Learn/Known contract.
\i db/deploy-contract/postflight-137.sql

DO $$
DECLARE
  trigger_state record;
BEGIN
  IF to_regprocedure('private.shared_meaning_other_direction(text)') IS NULL
     OR to_regprocedure('private.sync_shared_meaning_known_mark()') IS NULL THEN
    RAISE EXCEPTION 'shared meaning Known functions are missing';
  END IF;

  SELECT trigger_row.tgenabled, trigger_row.tgfoid::regprocedure::text
    INTO trigger_state
    FROM pg_trigger trigger_row
   WHERE trigger_row.tgrelid = 'public.user_card_known_marks'::regclass
     AND trigger_row.tgname = 'sync_shared_meaning_known_mark'
     AND NOT trigger_row.tgisinternal;
  IF NOT FOUND
     OR trigger_state.tgenabled <> 'O'
     OR trigger_state.tgfoid::regprocedure::text
        <> 'private.sync_shared_meaning_known_mark()' THEN
    RAISE EXCEPTION 'shared meaning Known trigger is missing or disabled';
  END IF;

  IF to_regprocedure('public.start_learning_entry_card(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.get_platform_v2_card_states_for_entries(uuid,uuid[],text[])') IS NULL THEN
    RAISE EXCEPTION 'shared meaning Platform contract is incomplete';
  END IF;
END;
$$;
