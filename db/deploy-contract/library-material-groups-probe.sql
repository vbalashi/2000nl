-- Read-only assertions for first-party material browse; no fixture writes.
DO $material_contract$
DECLARE signature regprocedure; definition text; delegated boolean:=false; authority regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.lookup_platform_v2_library_material_entries(uuid,text,text,uuid[],text,integer,integer,jsonb,jsonb)'::regprocedure,
    'public.read_platform_v2_library_group(uuid,uuid,integer)'::regprocedure
  ] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=signature)
      OR has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'db-contract-gate: material browse RPC privilege mismatch: %', signature;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'private.library_material_entry_ids_v1(uuid,jsonb)'::regprocedure,
    'private.lookup_platform_v2_library_material_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure,
    'private.lookup_platform_v2_library_material_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'::regprocedure,
    'private.read_platform_v2_library_group_base_v1(uuid,uuid,integer)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR has_function_privilege('service_role',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'db-contract-gate: material implementation exposed: %', signature;
    END IF;
  END LOOP;
  definition := pg_get_functiondef('private.read_platform_v2_library_group_base_v1(uuid,uuid,integer)'::regprocedure);
  IF (strpos(definition,'can_browse_dictionary(')=0
      AND strpos(definition,'private.entry_access_v1(p_user_id,entry.id,''browse'')')=0)
    OR strpos(definition,'can_access_dictionary(')>0 THEN
    RAISE EXCEPTION 'db-contract-gate: Library exact reader must use browse authority';
  END IF;
  delegated:=strpos(definition,'private.entry_access_v1(')>0;
  definition := pg_get_functiondef('private.read_platform_v2_training_group_base_v1(uuid,uuid,integer)'::regprocedure);
  IF strpos(definition,'can_access_dictionary(')=0
    AND strpos(definition,'private.entry_access_v1(p_user_id,entry.id,''train'')')=0 THEN
    RAISE EXCEPTION 'db-contract-gate: training exact reader authority changed';
  END IF;
  delegated:=delegated OR strpos(definition,'private.entry_access_v1(')>0;
  IF delegated THEN
    authority:=to_regprocedure('private.entry_access_v1(uuid,uuid,text)');
    IF authority IS NULL THEN RAISE EXCEPTION 'db-contract-gate: delegated entry authority missing'; END IF;
    definition:=pg_get_functiondef(authority);
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=authority)
      OR has_function_privilege('anon',authority,'EXECUTE')
      OR has_function_privilege('authenticated',authority,'EXECUTE')
      OR has_function_privilege('service_role',authority,'EXECUTE')
      OR strpos(definition,'private.active_word_entries')=0
      OR strpos(definition,'public.can_browse_dictionary(')=0
      OR strpos(definition,'public.can_access_dictionary(')=0
      OR strpos(definition,'private.can_read_shared_author_entry_v1(')=0
      OR strpos(definition,'''browse'',''train''')=0 THEN
      RAISE EXCEPTION 'db-contract-gate: delegated entry authority lost mode/archive/privacy fences';
    END IF;
  END IF;
END;
$material_contract$;
