DO $probe$
DECLARE
  access_check constant text := 'public.can_access_dictionary(p_user_id, d.id, ''read'')';
  helper record;
  definition text;
  signature regprocedure;
BEGIN
  FOR helper IN
    SELECT * FROM (VALUES
      ('private.get_detailed_training_stats_utc_legacy_v1(uuid,text[],uuid,text)'::regprocedure, 7),
      ('private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)'::regprocedure, 1)
    ) AS routines(signature, expected_count)
  LOOP
    definition := pg_get_functiondef(helper.signature);
    IF strpos(definition, 'can_access_dictionary(p_user_id, w.dictionary_id, ''read'')') <> 0
        OR (length(definition) - length(replace(definition, access_check, ''))) / length(access_check) <> helper.expected_count
        OR has_function_privilege('anon', helper.signature, 'EXECUTE')
        OR has_function_privilege('authenticated', helper.signature, 'EXECUTE')
        OR has_function_privilege('service_role', helper.signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected training statistics SQL or grants on %', helper.signature;
    END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.get_detailed_training_stats(uuid,text[],uuid,text)'::regprocedure,
    'public.get_detailed_training_stats(uuid,text[],uuid,text,text)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE')
        OR NOT has_function_privilege('authenticated', signature, 'EXECUTE')
        OR NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected training statistics grants on %', signature;
    END IF;
  END LOOP;
END
$probe$;
