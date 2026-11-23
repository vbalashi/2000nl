-- Verify the installed DB392 implementations as well as their private ACLs.
DO $probe$
DECLARE
  selector regprocedure := 'private.library_category_entry_ids_v1(uuid,jsonb)'::regprocedure;
  headwords regprocedure := 'private.search_library_headwords_v1(uuid,boolean,text,text,uuid[],integer,text,jsonb)'::regprocedure;
  selector_body text := pg_get_functiondef(selector);
  headword_body text := pg_get_functiondef(headwords);
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.oid IN (selector, headwords)
      AND (NOT p.prosecdef OR p.provolatile <> 's'
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('service_role', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'Library search helper privileges or volatility differ from DB392';
  END IF;

  IF strpos(selector_body, 'SELECT id FROM authorized WHERE (SELECT unfiltered FROM selection) IS TRUE') = 0
    OR strpos(headword_body, 'ELSE p_user_id IS NOT NULL AND EXISTS') > 0
    OR cardinality(string_to_array(headword_body, 'JOIN selected_entries chosen ON chosen.entry_id=s.entry_id')) <> 6 THEN
    RAISE EXCEPTION 'DB392 authorized category search implementation required';
  END IF;
END;
$probe$;
