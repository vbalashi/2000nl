DO $$ BEGIN
 IF to_regprocedure('public.read_platform_v2_library_groups(uuid,uuid[])') IS NULL
  OR NOT has_function_privilege('service_role','public.read_platform_v2_library_groups(uuid,uuid[])','EXECUTE')
  OR has_function_privilege('authenticated','public.read_platform_v2_library_groups(uuid,uuid[])','EXECUTE')
  OR has_function_privilege('anon','public.read_platform_v2_library_groups(uuid,uuid[])','EXECUTE')
  OR has_function_privilege('service_role','private.search_library_category_pre375(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text)','EXECUTE')
 THEN RAISE EXCEPTION 'library_article_batch_contract_missing'; END IF;
END $$;
