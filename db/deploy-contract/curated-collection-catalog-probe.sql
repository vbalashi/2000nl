-- Read-only check of curated collection discovery and private catalog policy.
DO $probe$
DECLARE definition text;
BEGIN
 IF to_regclass('private.curated_collection_catalog_groups') IS NULL OR
    to_regprocedure('private.curated_collection_in_catalog_v1(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'db-contract-gate: curated catalog audience missing';
 END IF;
 IF to_regprocedure('public.get_enabled_curated_training_list_ids_v1(text)') IS NULL OR
    NOT has_function_privilege('authenticated','public.get_enabled_curated_training_list_ids_v1(text)','execute') OR
    has_function_privilege('anon','public.get_enabled_curated_training_list_ids_v1(text)','execute') THEN
  RAISE EXCEPTION 'db-contract-gate: training curated selection unavailable or exposed';
 END IF;
 IF has_table_privilege('authenticated','private.curated_collection_catalog_groups','select') OR
    has_function_privilege('authenticated','private.curated_collection_in_catalog_v1(uuid,uuid)','execute') THEN
  RAISE EXCEPTION 'db-contract-gate: curated catalog audience exposed';
 END IF;
 definition:=pg_get_functiondef('public.get_available_word_lists(uuid,text,text)'::regprocedure);
 IF strpos(definition,'availability.available_item_count > 0')=0 OR
    strpos(definition,'private.curated_collection_in_catalog_v1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: curated catalog visibility missing';
 END IF;
 definition:=pg_get_functiondef('public.get_training_material_progress_v1(text)'::regprocedure);
 IF strpos(definition,'private.curated_collection_in_catalog_v1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: curated progress visibility missing';
 END IF;
 definition:=pg_get_functiondef('public.get_word_list_summary(uuid,uuid,text)'::regprocedure);
 IF strpos(definition,'private.curated_collection_in_catalog_v1')=0 OR
    strpos(definition,'can_browse_dictionary')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: curated summary visibility missing';
 END IF;
END;
$probe$;
