BEGIN READ ONLY;
DO $probe$
DECLARE prepare_f regprocedure := 'public.prepare_words_bulk_collection_v1(uuid[],text,text,uuid[],jsonb,jsonb,uuid,boolean,text)'::regprocedure;
 confirm_f regprocedure := 'public.confirm_words_bulk_collection_v1(uuid)'::regprocedure;
 receipt_f regprocedure := 'public.read_words_bulk_collection_plan_v1(uuid)'::regprocedure;
 resolver regprocedure := 'private.words_bulk_resolve_v1(uuid,uuid[],text,text,uuid[],jsonb,jsonb,boolean,text)'::regprocedure;
BEGIN
 IF has_function_privilege('anon',prepare_f,'EXECUTE') OR NOT has_function_privilege('authenticated',prepare_f,'EXECUTE')
 OR has_function_privilege('anon',confirm_f,'EXECUTE') OR NOT has_function_privilege('authenticated',confirm_f,'EXECUTE')
 OR has_function_privilege('anon',receipt_f,'EXECUTE') OR NOT has_function_privilege('authenticated',receipt_f,'EXECUTE')
 OR has_function_privilege('authenticated',resolver,'EXECUTE') OR to_regprocedure('public.words_bulk_collection_v1(uuid[],text,text,uuid[],jsonb,jsonb,uuid,text,boolean,text)') IS NOT NULL
 OR position('auth.uid()' IN pg_get_functiondef(prepare_f))=0 OR position('auth.uid()' IN pg_get_functiondef(confirm_f))=0 THEN
  RAISE EXCEPTION 'db-contract-gate: bulk collection boundary changed';
 END IF;
END;
$probe$;
COMMIT;
