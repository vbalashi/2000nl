-- Read-only structural assertions for the group-sharing authority boundary.
DO $group_contract$
DECLARE relation regclass; routine regprocedure;
BEGIN
 FOREACH relation IN ARRAY ARRAY['public.user_word_lists'::regclass,'public.user_word_list_items'::regclass] LOOP
  IF has_table_privilege('authenticated',relation,'INSERT,UPDATE,DELETE,TRUNCATE')
   OR has_table_privilege('anon',relation,'INSERT,UPDATE,DELETE,TRUNCATE') THEN
   RAISE EXCEPTION 'db-contract-gate: collection composition bypass exposed: %',relation; END IF;
 END LOOP;
 FOREACH relation IN ARRAY ARRAY[
 'private.label_sharing_roots'::regclass,'private.label_sharing_subscriptions'::regclass,
 'private.label_share_command_receipts'::regclass,'private.label_organization_plans'::regclass,
 'private.collection_composition_plans'::regclass] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=relation)
   OR has_table_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role',relation,'SELECT,INSERT,UPDATE,DELETE') THEN
   RAISE EXCEPTION 'db-contract-gate: group storage exposed: %',relation; END IF;
 END LOOP;
 FOREACH routine IN ARRAY ARRAY[
 'private.lock_collection_entry_addition_v1(uuid,uuid)'::regprocedure,
 'private.mutate_collection_labels_core_v1(uuid,bigint,jsonb)'::regprocedure,
 'private.add_entry_to_user_list_core_v1(uuid,uuid,uuid)'::regprocedure,
 'private.remove_entries_from_user_list_core_v1(uuid,uuid,uuid[])'::regprocedure,
 'private.delete_user_word_list_core_v1(uuid,uuid)'::regprocedure] LOOP
  IF has_function_privilege('authenticated',routine,'EXECUTE') OR has_function_privilege('anon',routine,'EXECUTE')
   OR has_function_privilege('service_role',routine,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: internal group writer exposed: %',routine; END IF;
 END LOOP;
 FOREACH routine IN ARRAY ARRAY[
 'public.read_label_share_v1(uuid)'::regprocedure,
 'public.command_label_share_v1(uuid,jsonb,boolean)'::regprocedure,
 'public.preview_shared_resource_v1(text)'::regprocedure,
 'public.read_label_share_collections_v1(uuid,uuid,integer)'::regprocedure,
 'public.prepare_label_organization_v1(bigint,jsonb)'::regprocedure,
 'public.confirm_label_organization_v1(uuid)'::regprocedure,
 'public.read_label_organization_plan_v1(uuid)'::regprocedure,
 'public.prepare_collection_composition_v1(uuid,jsonb)'::regprocedure,
 'public.confirm_collection_composition_v1(uuid)'::regprocedure,
 'public.read_collection_composition_plan_v1(uuid)'::regprocedure] LOOP
  IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'] FROM pg_proc WHERE oid=routine)
   OR NOT has_function_privilege('authenticated',routine,'EXECUTE')
   OR has_function_privilege('anon',routine,'EXECUTE') OR has_function_privilege('service_role',routine,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: group RPC boundary changed: %',routine; END IF;
 END LOOP;
 IF strpos(pg_get_functiondef('public.get_user_list_memberships_for_entries(uuid,uuid[])'::regprocedure),
  'private.entry_access_v1(p_user_id,entry.id,''train'')')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: exact received membership authority missing'; END IF;
END;
$group_contract$;
