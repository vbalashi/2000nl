DO $$
DECLARE
 gate regprocedure := 'private.library_label_accessible_v1(uuid,uuid)'::regprocedure;
 browse regprocedure := 'public.lookup_platform_v2_library_material_entries(uuid,text,text,uuid[],text,integer,integer,jsonb,jsonb)'::regprocedure;
 search regprocedure := 'private.search_library_category_pre375(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text)'::regprocedure;
 material regprocedure := 'private.library_material_entry_ids_v1(uuid,jsonb)'::regprocedure;
 bulk regprocedure := 'private.words_bulk_material_sources_v1(uuid,jsonb)'::regprocedure;
BEGIN
 IF has_function_privilege('anon',gate,'EXECUTE')
  OR has_function_privilege('authenticated',gate,'EXECUTE')
  OR has_function_privilege('service_role',gate,'EXECUTE')
  OR NOT has_function_privilege('postgres',gate,'EXECUTE')
  OR position('private.library_label_accessible_v1(' IN pg_get_functiondef(browse))=0
  OR position('private.library_label_accessible_v1(' IN pg_get_functiondef(search))=0
  OR position('private.live_label_sharing_collections_v1' IN pg_get_functiondef(material))=0
  OR position('private.live_label_sharing_collections_v1' IN pg_get_functiondef(bulk))=0
 THEN RAISE EXCEPTION 'DB382 shared label material contract is incomplete';
 END IF;
END $$;
