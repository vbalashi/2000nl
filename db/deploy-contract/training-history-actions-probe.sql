DO $probe$
DECLARE reader regprocedure := to_regprocedure('public.get_recent_training_activity_v2(integer)');
BEGIN
 IF reader IS NULL OR NOT has_function_privilege('authenticated',reader,'EXECUTE')
   OR has_function_privilege('anon',reader,'EXECUTE') OR has_function_privilege('service_role',reader,'EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: training history v2 missing or grants invalid';
 END IF;
 IF to_regclass('private.training_headword_events_recent_idx') IS NULL
   OR to_regclass('private.training_pair_events_recent_idx') IS NULL
   OR to_regclass('public.training_known_events_recent_idx') IS NULL THEN
  RAISE EXCEPTION 'db-contract-gate: training history indexes missing';
 END IF;
END;
$probe$;
