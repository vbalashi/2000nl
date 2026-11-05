-- Read-only metadata check. Behavioral ranking/access checks use synthetic data.
DO $probe$
DECLARE f regprocedure := 'private.search_dictionary_headwords_group_v1(uuid,boolean,text,text,uuid[],integer,text)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s'
    AND 'pg_trgm.similarity_threshold=0.3'=ANY(proconfig))
    OR position('fuzzy_candidates' IN pg_get_functiondef(f))=0
    OR has_function_privilege('anon',f,'EXECUTE')
    OR has_function_privilege('authenticated',f,'EXECUTE') THEN
    RAISE EXCEPTION 'grouped_word_search_fuzzy_contract';
  END IF;
END;
$probe$;
