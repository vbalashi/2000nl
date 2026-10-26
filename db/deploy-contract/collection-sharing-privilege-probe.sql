-- Read-only postflight for #756. No grants, data writes or rollout changes.
DO $probe$
DECLARE signature text; owner_id oid;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.command_collection_share_v1(uuid,text,uuid,integer,text,boolean)',
  'public.write_entry_note_v1(uuid,bigint,text)',
  'public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],integer)'
 ] LOOP
  SELECT proc.proowner INTO owner_id
  FROM pg_catalog.pg_proc proc JOIN pg_catalog.pg_roles role ON role.oid=proc.proowner
  WHERE proc.oid=pg_catalog.to_regprocedure(signature) AND proc.prosecdef;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'sharing SECURITY DEFINER contract missing'; END IF;
  IF NOT pg_catalog.has_table_privilege(owner_id,'auth.users','SELECT') OR
     NOT pg_catalog.has_table_privilege(owner_id,'auth.users','UPDATE') THEN
   RAISE EXCEPTION 'sharing function owner requires source-preserved auth row lock privileges';
  END IF;
 END LOOP;
 IF pg_catalog.has_any_column_privilege('authenticated','auth.users','UPDATE') OR
    pg_catalog.has_any_column_privilege('anon','auth.users','UPDATE') THEN
  RAISE EXCEPTION 'end-user auth mutation privilege is open'; END IF;
 IF pg_catalog.has_function_privilege('service_role','public.fetch_dictionary_entry_by_id_gated(uuid)','EXECUTE') OR
    NOT pg_catalog.has_function_privilege('service_role','public.platform_rpc_contract_ready_v1()','EXECUTE') OR
    pg_catalog.has_function_privilege('authenticated','public.platform_rpc_contract_ready_v1()','EXECUTE') OR
    pg_catalog.has_function_privilege('anon','public.platform_rpc_contract_ready_v1()','EXECUTE') THEN
  RAISE EXCEPTION 'sharing metadata versus article privilege contract differs'; END IF;
 IF NOT public.platform_rpc_contract_ready_v1() THEN RAISE EXCEPTION 'platform metadata contract incomplete'; END IF;
END;
$probe$;
