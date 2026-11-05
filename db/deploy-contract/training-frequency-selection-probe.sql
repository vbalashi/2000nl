DO $probe$
DECLARE f regprocedure := 'private.vocabulary_frequency_entry_ids_v1(jsonb)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s')
    OR has_function_privilege('service_role',f,'EXECUTE')
    OR has_function_privilege('authenticated',f,'EXECUTE')
    OR has_function_privilege('anon',f,'EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.word_entries_active_vocabulary_spelling_v1_idx') AND indisvalid)
    OR position('candidates AS MATERIALIZED' in pg_get_functiondef(f))=0 THEN
    RAISE EXCEPTION 'training_frequency_selection_contract';
  END IF;
END;
$probe$;
