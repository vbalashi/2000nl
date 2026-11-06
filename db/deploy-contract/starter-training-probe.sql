BEGIN READ ONLY;
DO $probe$
DECLARE f regprocedure := 'public.retry_starter_training_v1()'::regprocedure;
BEGIN
 IF to_regclass('private.starter_training_initializations') IS NULL
 OR to_regclass('private.starter_training_config') IS NULL
 OR has_function_privilege('anon',f,'EXECUTE')
 OR NOT has_function_privilege('authenticated',f,'EXECUTE')
 OR has_table_privilege('authenticated','private.starter_training_initializations','SELECT')
 OR has_table_privilege('authenticated','private.starter_training_config','SELECT') THEN
  RAISE EXCEPTION 'db-contract-gate: starter training boundary changed';
 END IF;
END;
$probe$;
COMMIT;
