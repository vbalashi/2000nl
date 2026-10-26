-- Read-only contract checks. No users, article copies or learning writes.
DO $independent_copy_contract$
DECLARE relation regclass; signature regprocedure; definition text; projected jsonb; delegate regprocedure; source_fn regprocedure; source_definition text;
BEGIN
 FOREACH relation IN ARRAY ARRAY[
  'private.independent_entry_copy_receipts'::regclass,
  'private.legacy_entry_copy_receipts'::regclass,
  'private.collection_copy_receipts'::regclass
 ] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=relation)
    OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=relation)
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=relation AND contype='p')
    OR has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role',relation,'SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'db-contract-gate: copy receipt storage exposed or unconstrained: %',relation;
  END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'private.copy_instructional_json_v1(jsonb,integer)'::regprocedure,
  'private.copy_text_array_v1(jsonb)'::regprocedure,
  'private.portable_owned_entry_content_v1(jsonb,text)'::regprocedure,
  'private.validate_simple_user_entry_v1(jsonb,text)'::regprocedure,
  'private.simple_user_entry_content_nodes_v1(jsonb)'::regprocedure,
  'private.owned_entry_content_atom_v1(text,text,text,text)'::regprocedure,
  'private.merge_owned_entry_edit_v1(jsonb,jsonb)'::regprocedure,
  'private.independent_copy_snapshot_v1(uuid,uuid)'::regprocedure,
  'private.copy_legacy_owned_entry_v1(uuid,uuid,uuid,jsonb)'::regprocedure,
  'private.collection_membership_digest_v1(uuid)'::regprocedure,
  'private.collection_copy_plan_v1(uuid,uuid)'::regprocedure,
  'private.commit_collection_copy_plan_v1(uuid,uuid,uuid,text,jsonb)'::regprocedure
 ] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE')
   OR has_function_privilege('authenticated',signature,'EXECUTE')
   OR has_function_privilege('service_role',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: copy implementation helper exposed: %',signature;
  END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'public.preview_independent_entry_copy_v1(uuid)'::regprocedure,
  'public.copy_independent_entry_v1(uuid,uuid,text,uuid)'::regprocedure,
  'public.read_independent_entry_copy_receipt_v1(uuid)'::regprocedure,
  'public.copy_entry_to_user_dictionary(uuid,uuid,uuid,jsonb)'::regprocedure,
  'public.preview_collection_independent_copy_v1(uuid)'::regprocedure,
  'public.copy_collection_independent_entries_v1(uuid,uuid,text)'::regprocedure,
  'public.read_collection_copy_receipt_v1(uuid)'::regprocedure
 ] LOOP
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=signature)
   OR NOT EXISTS(SELECT 1 FROM pg_proc,unnest(proconfig) setting WHERE oid=signature AND setting LIKE 'search_path=pg_catalog,%pg_temp')
   OR has_function_privilege('anon',signature,'EXECUTE')
   OR has_function_privilege('service_role',signature,'EXECUTE')
   OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: copy authenticated RPC boundary changed: %',signature;
  END IF;
 END LOOP;
 definition:=pg_get_functiondef('private.independent_copy_snapshot_v1(uuid,uuid)'::regprocedure);
 IF strpos(definition,'private.active_word_entries')=0 OR strpos(definition,'can_browse_dictionary')=0
   OR strpos(definition,'FOR UPDATE')=0 OR strpos(definition,'FOR SHARE')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: copy source authorization/archive/lock fence missing';
 END IF;
 definition:=pg_get_functiondef('public.copy_independent_entry_v1(uuid,uuid,text,uuid)'::regprocedure);
 -- A closed mutation core may preserve the original receipt/write boundary.
 IF strpos(definition,'private.copy_independent_entry_core_v1')>0 THEN
  delegate:=to_regprocedure('private.copy_independent_entry_core_v1(uuid,uuid,text,uuid,boolean)');
  source_fn:=to_regprocedure('private.independent_copy_snapshot_with_notes_v1(uuid,uuid)');
  IF delegate IS NULL OR source_fn IS NULL
    OR strpos(regexp_replace(definition,'\s','','g'),'p_target_dictionary_id,true)')=0
    OR strpos(pg_get_function_arguments(delegate),'p_include_shared_material boolean DEFAULT false')=0 THEN
   RAISE EXCEPTION 'db-contract-gate: invalid copy delegation';
  END IF;
  FOREACH signature IN ARRAY ARRAY[delegate,source_fn] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND prosecdef
      AND pg_get_userbyid(proowner)='postgres'
      AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])
     OR has_function_privilege('anon',signature,'EXECUTE')
     OR has_function_privilege('authenticated',signature,'EXECUTE')
     OR has_function_privilege('service_role',signature,'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: copy delegate security changed';
   END IF;
  END LOOP;
  source_definition:=pg_get_functiondef(source_fn);
  IF strpos(source_definition,'private.active_word_entries')=0 OR strpos(source_definition,'private.entry_access_v1')=0
    OR strpos(source_definition,'private.shared_author_entry_memberships_v1')=0
    OR strpos(source_definition,'private.collection_sharing_roots')=0
    OR strpos(source_definition,'FOR UPDATE')=0 OR strpos(source_definition,'FOR SHARE')=0
    OR strpos(source_definition,'scope.root_id=ANY(roots)')=0
    OR strpos(source_definition,'private.entry_note_scope_material_v1')=0
    OR strpos(source_definition,'copy_source_changed')=0 OR strpos(source_definition,'access_lifetime')=0 THEN
   RAISE EXCEPTION 'db-contract-gate: shared copy source/lease fence missing';
  END IF;
  definition:=pg_get_functiondef(delegate);
  IF strpos(definition,'independent_entry_copy_receipts')>strpos(definition,'snapshot:=private.independent_copy_snapshot_with_notes_v1') THEN
   RAISE EXCEPTION 'db-contract-gate: shared copy receipt ordering changed';
  END IF;
 END IF;

 IF strpos(definition,'private.commit_independent_copy_snapshot_v1')>0 THEN
  signature:='private.commit_independent_copy_snapshot_v1(uuid,uuid,uuid,text,uuid,boolean,jsonb)'::regprocedure;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND prosecdef AND pg_get_userbyid(proowner)='postgres'
      AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])
    OR has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
    OR has_function_privilege('service_role',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: prepared copy writer exposed';
  END IF;
  source_definition:=pg_get_functiondef(signature);
  IF strpos(source_definition,'snapshot->>''revision'' IS DISTINCT FROM p_expected_revision')=0
    OR strpos(source_definition,'principal IS DISTINCT FROM (select auth.uid())')=0
    OR strpos(source_definition,'INSERT INTO public.word_entries')=0
    OR strpos(source_definition,'INSERT INTO private.independent_entry_copy_receipts')=0
    OR source_definition ~* 'ON\s+CONFLICT' THEN
   RAISE EXCEPTION 'db-contract-gate: prepared copy write fence missing';
  END IF;
  definition:=definition||source_definition;
  FOREACH signature IN ARRAY ARRAY[
    'private.collection_copy_admission_v1(uuid,uuid)'::regprocedure,
    'private.independent_copy_snapshot_in_cohort_v1(uuid,uuid,jsonb)'::regprocedure
  ] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=signature AND prosecdef AND pg_get_userbyid(proowner)='postgres'
      AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])
     OR has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
     OR has_function_privilege('service_role',signature,'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: batch cohort helper exposed';
   END IF;
  END LOOP;
  source_definition:=pg_get_functiondef('private.independent_copy_snapshot_in_cohort_v1(uuid,uuid,jsonb)'::regprocedure);
  IF strpos(source_definition,'p_cohort IS NULL')=0 OR strpos(source_definition,'p_cohort->''entries''')=0
    OR strpos(source_definition,'p_cohort->''dictionaries''')=0 OR strpos(source_definition,'p_cohort->''owners''')=0
    OR strpos(source_definition,'p_cohort->''roots''')=0 OR strpos(source_definition,'FOR UPDATE NOWAIT')=0
    OR strpos(source_definition,'FOR SHARE NOWAIT')=0 THEN
   RAISE EXCEPTION 'db-contract-gate: batch fixed cohort fence missing';
  END IF;
  source_definition:=pg_get_functiondef('private.collection_copy_plan_v1(uuid,uuid)'::regprocedure);
  IF strpos(source_definition,'private.collection_copy_admission_v1')=0
    OR strpos(source_definition,'private.independent_copy_snapshot_in_cohort_v1')=0 THEN
   RAISE EXCEPTION 'db-contract-gate: mixed batch plan bypasses cohort';
  END IF;

 END IF;
 IF strpos(definition,'copy_source_changed')=0 OR strpos(definition,'copy_operation_conflict')=0
   OR strpos(definition,'independent-copy-recipient:')=0
   OR strpos(definition,'independent_entry_copy_receipts')=0
   OR strpos(definition,'independent_entry_copy_receipts')>strpos(definition,'snapshot:=private.independent_copy_snapshot_v1')
   OR definition ~* 'ON\s+CONFLICT' THEN
  RAISE EXCEPTION 'db-contract-gate: independent copy receipt/version/fresh identity fence missing';
 END IF;
 definition:=pg_get_functiondef('private.copy_legacy_owned_entry_v1(uuid,uuid,uuid,jsonb)'::regprocedure);
 IF strpos(definition,'private.active_word_entries')=0 OR strpos(definition,'FOR UPDATE')=0
   OR (strpos(definition,'portable_owned_entry_content_v1')=0 AND strpos(definition,'copy_source_content_v1')=0) OR definition ~* 'ON\s+CONFLICT' THEN
  RAISE EXCEPTION 'db-contract-gate: legacy copy archive/rich/collision protection missing';
 END IF;
 definition:=pg_get_functiondef('public.update_user_dictionary_entry(uuid,uuid,jsonb)'::regprocedure);
 IF strpos(definition,'merge_owned_entry_edit_v1')=0 OR strpos(definition,'private.active_word_entries')=0
   OR strpos(definition,'FOR UPDATE')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: rich edit preservation/archive lock missing';
 END IF;
 definition:=pg_get_functiondef('private.commit_collection_copy_plan_v1(uuid,uuid,uuid,text,jsonb)'::regprocedure);
 IF strpos(definition,'collection_membership_digest_v1')=0 OR strpos(definition,'FOR UPDATE')=0
   OR strpos(definition,'copy_collection_changed')=0 OR (strpos(definition,'copy_independent_entry_v1')=0
     AND strpos(definition,'private.copy_independent_entry_core_v1(gen_random_uuid(),(item->>''entryId'')::uuid,item->>''revision'')')=0
     AND strpos(definition,'private.commit_independent_copy_snapshot_v1(')=0)
   OR strpos(definition,'collection_copy_receipts')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: atomic collection copy membership/receipt fence missing';
 END IF;
 projected:=private.portable_owned_entry_content_v1('{"meanings":[{"definition":"meaning","examples":["example"]}],"notes":"owned note","sourceEntryId":"discard","generation":{"provider":"discard"}}');
 IF projected ? 'sourceEntryId' OR projected ? 'generation' OR projected->>'notes'<>'owned note'
  OR jsonb_array_length(private.platform_v2_user_entry_content_nodes(projected))<>3 THEN
  RAISE EXCEPTION 'db-contract-gate: bounded rich projection/owned note bindings missing';
 END IF;
 IF to_regprocedure('private.collection_copy_admission_v1(uuid,uuid)') IS NOT NULL THEN
  projected:=private.portable_owned_entry_content_v1('{"meanings":[{"definition":"meaning","cross_references":[{"headword":"related","sourceEntryId":"discard"}]}],"cross_reference":{"headword":"base","url":"discard"},"reference_tables":[{"title":"forms","rows":[{"label":"past","value":"was","url":"discard"}]}],"displayPronunciation":"word","source_identity":{"homograph_number":2,"sourceEntryId":"discard"}}');
  IF projected#>>'{meanings,0,cross_references,0,headword}' IS DISTINCT FROM 'related'
    OR projected#>>'{cross_reference,headword}' IS DISTINCT FROM 'base'
    OR projected#>>'{reference_tables,0,rows,0,value}' IS DISTINCT FROM 'was'
    OR projected->>'displayPronunciation' IS DISTINCT FROM 'word'
    OR projected->>'homograph_number' IS DISTINCT FROM '2'
    OR projected ? 'source_identity' OR strpos(projected::text,'discard')>0 THEN
   RAISE EXCEPTION 'db-contract-gate: mixed copy loses visible reference/header or exposes hidden identity';
  END IF;
 END IF;
END;
$independent_copy_contract$;
