BEGIN READ ONLY;
DO $account_training_setups_contract$
DECLARE v_function regprocedure := 'public.save_account_training_setups_v1(integer,jsonb)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass
    AND attname='training_setups' AND attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass
    AND attname='training_setups_revision' AND attnotnull AND NOT attisdropped)
    OR (SELECT prosecdef FROM pg_proc WHERE oid=v_function)
    OR has_function_privilege('anon',v_function,'EXECUTE')
    OR NOT has_function_privilege('authenticated',v_function,'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: account training setups boundary changed';
  END IF;
END;
$account_training_setups_contract$;
COMMIT;
