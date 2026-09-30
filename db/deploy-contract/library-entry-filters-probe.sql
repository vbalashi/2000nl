BEGIN READ ONLY;
DO $probe$
DECLARE
 fn regprocedure := 'public.lookup_platform_v2_library_filtered_entries(uuid,text,text,uuid[],text,integer,integer,jsonb)'::regprocedure;
 helper regprocedure := 'private.lookup_platform_v2_library_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure;
 matcher regprocedure := 'private.library_entry_matches_filters_v1(text,text,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(helper);
BEGIN
 IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE')
  OR NOT has_function_privilege('service_role',fn,'EXECUTE') THEN RAISE EXCEPTION 'Library filter RPC grants'; END IF;
 IF has_function_privilege('anon',helper,'EXECUTE') OR has_function_privilege('authenticated',helper,'EXECUTE')
  OR has_function_privilege('service_role',helper,'EXECUTE') OR has_function_privilege('anon',matcher,'EXECUTE')
  OR has_function_privilege('authenticated',matcher,'EXECUTE') OR has_function_privilege('service_role',matcher,'EXECUTE') THEN RAISE EXCEPTION 'Library filter helper grants'; END IF;
 IF (length(definition)-length(replace(definition,'private.library_entry_matches_filters_v1','')))/length('private.library_entry_matches_filters_v1')<>6
  OR strpos(definition,'p_library_selection::text')=0 OR strpos(definition,'dictionary_entitlements')=0
  OR strpos(definition,'SELECT count(*)::integer FROM candidate_groups')=0
  OR strpos(definition,'group_entry_ids AS')=0 THEN RAISE EXCEPTION 'Library filter tier/count/identity boundary'; END IF;
 definition := pg_get_functiondef(fn);
 IF strpos(definition,'invalid_library_filters')=0 OR strpos(definition,'FROM public.user_settings WHERE user_id=p_user_id')=0
  OR strpos(definition,'private.attach_platform_v2_presentation_identity_v1')=0 THEN RAISE EXCEPTION 'Library filter validation/account boundary'; END IF;
END;
$probe$;
COMMIT;
