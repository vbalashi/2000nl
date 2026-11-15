DO $$
DECLARE reader text; writer text;
BEGIN
 SELECT pg_get_functiondef('public.read_app_release_notes_v1(text,text,integer,text)'::regprocedure),
        pg_get_functiondef('public.write_app_release_notes_v1(text,text,timestamptz,jsonb,integer,boolean)'::regprocedure)
 INTO reader,writer;
 IF position('content_locale' IN reader)=0 OR position('p_translations ? ''en''' IN writer)=0 THEN
  RAISE EXCEPTION 'release_notes_english_fallback_missing';
 END IF;
 IF has_function_privilege('anon','public.write_app_release_notes_v1(text,text,timestamptz,jsonb,integer,boolean)','execute')
 OR has_function_privilege('authenticated','public.read_app_release_notes_v1(text,text,integer,text)','execute') THEN
  RAISE EXCEPTION 'release_notes_rpc_boundary';
 END IF;
END $$;
