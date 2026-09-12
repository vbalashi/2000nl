-- Route the accepted Training action and session lifecycle through the same
-- private reference clock used by the temporal selector evidence.
--
-- This is a test seam only. The public RPC signatures and production behavior
-- remain unchanged: without the transaction-local setting the helper returns
-- statement_timestamp(). No scheduler policy is changed here.

BEGIN;

ALTER TABLE public.training_sessions
  ALTER COLUMN created_at
  SET DEFAULT private.training_reference_now_v1();
ALTER TABLE public.training_sessions
  ALTER COLUMN expires_at
  SET DEFAULT (private.training_reference_now_v1() + interval '24 hours');

ALTER TABLE public.training_session_action_bindings
  ALTER COLUMN created_at
  SET DEFAULT private.training_reference_now_v1();

ALTER TABLE public.user_card_action_events
  ALTER COLUMN created_at
  SET DEFAULT private.training_reference_now_v1();
ALTER TABLE public.platform_v2_action_receipts
  ALTER COLUMN created_at
  SET DEFAULT private.training_reference_now_v1();
ALTER TABLE public.user_card_known_marks
  ALTER COLUMN marked_at
  SET DEFAULT private.training_reference_now_v1();

-- Reinstall the current function bodies with only their wall-clock reads
-- routed through the already-reviewed private helper. Looking up the live
-- definition keeps this migration additive across the earlier layered
-- function replacements and avoids maintaining a second action path.
DO $clock_seam$
DECLARE
  function_oid regprocedure;
  function_definition text;
BEGIN
  function_oid := to_regprocedure(
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing start_training_session';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'public.get_next_training_session_card(uuid,uuid,text[])'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing get_next_training_session_card';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing private unavailable wrapper';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'private.mark_training_session_member_unavailable_base_v1(uuid,uuid,uuid,text,text)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing private unavailable base';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'private.consume_training_session_member(uuid,uuid,uuid,text)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing consume_training_session_member';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing public unavailable wrapper';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing private platform action';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'public.handle_card_review(uuid,uuid,text,text,uuid)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing handle_card_review';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'public.start_learning_entry_card(uuid,uuid,text)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing start_learning_entry_card';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;
END
$clock_seam$;

COMMIT;
