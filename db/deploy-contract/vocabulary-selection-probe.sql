DO $probe$
BEGIN
 IF to_regclass('private.vocabulary_frequency_profiles') IS NULL OR to_regclass('private.vocabulary_frequency_ranks') IS NULL
 OR to_regclass('public.word_entries_vocabulary_unit_v1_idx') IS NULL
 OR NOT private.valid_vocabulary_selection_v1('{"mode":"frequency","materialKinds":["word"],"profile":"spoken","from":1,"to":100,"meanings":2}')
 OR private.valid_vocabulary_selection_v1('{"mode":"frequency","materialKinds":[],"profile":"spoken","from":0,"to":100,"meanings":2}')
 OR private.normalize_training_part_of_speech_v1('voorvoegsel') IS DISTINCT FROM 'vv'
 OR private.valid_training_library_selection_v1('{"query":"test","category":["headwords"]}') THEN RAISE EXCEPTION 'vocabulary_selection_contract'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname IN ('vocabulary_frequency_profiles','vocabulary_frequency_ranks') AND NOT c.relrowsecurity)
 OR has_table_privilege('anon','private.vocabulary_frequency_ranks','SELECT')
 OR has_table_privilege('authenticated','private.vocabulary_frequency_ranks','SELECT')
 OR has_table_privilege('service_role','private.vocabulary_frequency_ranks','SELECT')
 OR has_function_privilege('authenticated','private.training_library_selection_entry_ids_v1(uuid,uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'vocabulary_selection_private_boundary'; END IF;
END;
$probe$;
