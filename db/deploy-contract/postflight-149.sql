-- Verify the accepted-action and session-lifecycle clock seam after migration 149.
\i db/deploy-contract/postflight-148.sql

DO $postflight_training_action_lifecycle_clock$
DECLARE
  session_card_fn regprocedure := to_regprocedure(
    'public.get_next_training_session_card(uuid,uuid,text[])'
  );
  unavailable_wrapper_fn regprocedure := to_regprocedure(
    'private.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)'
  );
  unavailable_base_fn regprocedure := to_regprocedure(
    'private.mark_training_session_member_unavailable_base_v1(uuid,uuid,uuid,text,text)'
  );
  consume_fn regprocedure := to_regprocedure(
    'private.consume_training_session_member(uuid,uuid,uuid,text)'
  );
  public_unavailable_fn regprocedure := to_regprocedure(
    'public.mark_training_session_member_unavailable(uuid,uuid,uuid,text,text)'
  );
  action_fn regprocedure := to_regprocedure(
    'private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)'
  );
  review_fn regprocedure := to_regprocedure(
    'public.handle_card_review(uuid,uuid,text,text,uuid)'
  );
  learning_fn regprocedure := to_regprocedure(
    'public.start_learning_entry_card(uuid,uuid,text)'
  );
  start_session_fn regprocedure := to_regprocedure(
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)'
  );
  session_card_definition text;
  unavailable_wrapper_definition text;
  unavailable_base_definition text;
  consume_definition text;
  public_unavailable_definition text;
  action_definition text;
  review_definition text;
  learning_definition text;
  start_session_definition text;
  table_default text;
BEGIN
  IF session_card_fn IS NULL
     OR unavailable_wrapper_fn IS NULL
     OR unavailable_base_fn IS NULL
     OR consume_fn IS NULL
     OR public_unavailable_fn IS NULL
     OR action_fn IS NULL
     OR review_fn IS NULL
     OR learning_fn IS NULL
     OR start_session_fn IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed training-action-lifecycle-signatures';
  END IF;

  session_card_definition := upper(pg_get_functiondef(session_card_fn));
  unavailable_wrapper_definition := upper(pg_get_functiondef(unavailable_wrapper_fn));
  unavailable_base_definition := upper(pg_get_functiondef(unavailable_base_fn));
  consume_definition := upper(pg_get_functiondef(consume_fn));
  public_unavailable_definition := upper(pg_get_functiondef(public_unavailable_fn));
  action_definition := upper(pg_get_functiondef(action_fn));
  review_definition := upper(pg_get_functiondef(review_fn));
  learning_definition := upper(pg_get_functiondef(learning_fn));
  start_session_definition := upper(pg_get_functiondef(start_session_fn));

  IF position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN session_card_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN unavailable_wrapper_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN unavailable_base_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN consume_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN public_unavailable_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN action_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN review_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN learning_definition) = 0
     OR position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN start_session_definition) = 0
     OR position('NOW()' IN session_card_definition) > 0
     OR position('NOW()' IN action_definition) > 0
     OR position('NOW()' IN review_definition) > 0
     OR position('NOW()' IN learning_definition) > 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed training-action-lifecycle-routing';
  END IF;

  SELECT pg_get_expr(defaults.adbin, defaults.adrelid)
    INTO table_default
    FROM pg_attrdef defaults
    JOIN pg_class relation ON relation.oid = defaults.adrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute
      ON attribute.attrelid = defaults.adrelid
     AND attribute.attnum = defaults.adnum
   WHERE namespace.nspname = 'public'
     AND relation.relname = 'training_sessions'
     AND attribute.attname = 'expires_at';
  IF position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN upper(COALESCE(table_default, ''))) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed training-session-expiry-default';
  END IF;

  SELECT pg_get_expr(defaults.adbin, defaults.adrelid)
    INTO table_default
    FROM pg_attrdef defaults
    JOIN pg_class relation ON relation.oid = defaults.adrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute
      ON attribute.attrelid = defaults.adrelid
     AND attribute.attnum = defaults.adnum
   WHERE namespace.nspname = 'public'
     AND relation.relname = 'platform_v2_action_receipts'
     AND attribute.attname = 'created_at';
  IF position('PRIVATE.TRAINING_REFERENCE_NOW_V1()' IN upper(COALESCE(table_default, ''))) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed action-receipt-default';
  END IF;
END
$postflight_training_action_lifecycle_clock$;
