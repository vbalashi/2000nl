\i db/deploy-contract/read-only-postflight-220.sql
DO $catalog_contract$
DECLARE f pg_proc; definition text;
BEGIN
 SELECT * INTO STRICT f FROM pg_proc WHERE oid='public.get_available_word_lists(uuid,text,text)'::regprocedure;
 definition:=pg_get_functiondef(f.oid);
 IF NOT f.prosecdef OR f.provolatile<>'s' OR NOT ('search_path=public, pg_temp'=ANY(f.proconfig))
 OR has_function_privilege('anon',f.oid,'EXECUTE')
 OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
 OR EXISTS(SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'catalog security contract changed'; END IF;
 IF strpos(definition,'p_user_id IS DISTINCT FROM (select auth.uid())')=0
 OR strpos(definition,'entry_sources AS MATERIALIZED')=0
 OR strpos(definition,'curated_source_counts AS MATERIALIZED')=0
 OR strpos(definition,'can_browse_dictionary')=0
 OR strpos(definition,'AND l.user_id = p_user_id')=0
 OR strpos(definition,'unavailable_source_count')=0
 THEN RAISE EXCEPTION 'catalog identity, availability or ownership contract changed'; END IF;
END;
$catalog_contract$;
