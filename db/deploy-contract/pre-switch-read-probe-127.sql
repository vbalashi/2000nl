DO $pre_switch_read_probe$
DECLARE
  qa_user_ids uuid[];
BEGIN
  SELECT array_agg(auth_user.id ORDER BY auth_user.id)
  INTO qa_user_ids
  FROM auth.users AS auth_user
  WHERE auth_user.email = 'test@2000nl.test';

  IF COALESCE(array_length(qa_user_ids, 1), 0) <> 1 THEN
    RAISE EXCEPTION
      'db-contract-gate: pre-switch-read-probe-failed qa-identity';
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub',
    qa_user_ids[1]::text,
    true
  );

  PERFORM public.get_training_session_plan(
    qa_user_ids[1],
    ARRAY['word-to-definition']::text[],
    NULL,
    'curated',
    'both',
    '{}'::jsonb
  );
END
$pre_switch_read_probe$;
