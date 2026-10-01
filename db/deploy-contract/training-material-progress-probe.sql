BEGIN READ ONLY;
DO $probe$
DECLARE
 reader regprocedure := 'public.get_training_material_progress_v1(text)'::regprocedure;
 definition text;
BEGIN
 IF has_function_privilege('anon',reader,'EXECUTE') OR has_function_privilege('service_role',reader,'EXECUTE')
  OR NOT has_function_privilege('authenticated',reader,'EXECUTE') THEN
  RAISE EXCEPTION 'material progress RPC grants'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE oid=reader AND prosecdef AND provolatile='s'
  AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])<>1 THEN
  RAISE EXCEPTION 'material progress trust boundary'; END IF;
 definition := pg_get_functiondef(reader);
 IF strpos(definition,'auth.uid()')=0 OR strpos(definition,'can_access_dictionary(principal,d.id,''read'')')=0
  OR strpos(definition,'s.user_id=principal')=0 OR strpos(definition,'l.user_id=principal')=0
  OR strpos(definition,'disabledDictionaryIds')=0 OR strpos(definition,'r.user_id=principal')=0 THEN
  RAISE EXCEPTION 'material progress owner/access boundary'; END IF;
 IF definition ~* '\m(insert|update|delete)\M' THEN
  RAISE EXCEPTION 'material progress must stay read-only'; END IF;
END;
$probe$;
COMMIT;
