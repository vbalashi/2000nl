BEGIN READ ONLY;
DO $probe$
DECLARE
 fn regprocedure := 'public.lookup_platform_v2_library_entries(uuid,text,text,uuid[],text,integer,integer)'::regprocedure;
 helper regprocedure := 'private.lookup_platform_v2_library_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure;
 definition text := pg_get_functiondef(helper);
BEGIN
 IF has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE')
   OR NOT has_function_privilege('service_role',fn,'EXECUTE') THEN RAISE EXCEPTION 'library scope RPC grants'; END IF;
 IF has_function_privilege('anon',helper,'EXECUTE') OR has_function_privilege('authenticated',helper,'EXECUTE')
   OR has_function_privilege('service_role',helper,'EXECUTE') THEN RAISE EXCEPTION 'library helper client grants'; END IF;
 IF strpos(definition,'p_library_selection::text')=0
   OR strpos(definition,'private.training_material_entry_selected_v1')=0
   OR strpos(definition,'private.training_material_entry_selected_v1')>strpos(definition,'indexed_headword_matches AS')
   OR strpos(definition,'dictionary_entitlements')=0
   OR strpos(definition,'after_cursor AS')=0 THEN RAISE EXCEPTION 'library scope/cursor/access boundary'; END IF;
 definition := pg_get_functiondef(fn);
 IF strpos(definition,'FROM public.user_settings WHERE user_id=p_user_id')=0
   OR strpos(definition,'private.attach_platform_v2_presentation_identity_v1')=0
   OR strpos(definition,'p_user_id,false')=0 THEN RAISE EXCEPTION 'library account/identity boundary'; END IF;
END;
$probe$;
COMMIT;
