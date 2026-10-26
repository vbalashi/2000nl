-- Metadata-only #756 contract. Behavioral/race tests remain separate release evidence.
DO $sharing_contract$
DECLARE relation regclass; signature regprocedure; role_name text; definition text;
BEGIN
 FOREACH relation IN ARRAY ARRAY[
  'private.collection_sharing_roots'::regclass,
  'private.collection_sharing_subscriptions'::regclass,
  'private.collection_sharing_invitations'::regclass,
  'private.collection_sharing_command_receipts'::regclass,
  'private.collection_share_terminal_rejections'::regclass,
  'private.collection_sharing_rollout'::regclass,
  'private.user_word_note_revisions'::regclass,
  'private.received_collection_label_placements'::regclass
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=relation AND relrowsecurity)
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=relation)
   OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=relation AND contype='p') THEN
   RAISE EXCEPTION 'db-contract-gate: sharing private storage constraints changed: %',relation;
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF pg_catalog.has_table_privilege(role_name,relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR pg_catalog.has_any_column_privilege(role_name,relation,'SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'db-contract-gate: sharing private storage exposed: %',relation;
   END IF;
  END LOOP;
 END LOOP;

 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='private.collection_sharing_invitations'::regclass AND contype='u'
    AND pg_catalog.pg_get_constraintdef(oid)='UNIQUE (secret_hash)')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='private.collection_sharing_invitations'::regclass AND contype='c'
    AND strpos(pg_catalog.pg_get_constraintdef(oid),'secret_hash = sha256')>0)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='private.collection_sharing_command_receipts'::regclass AND contype='c'
    AND strpos(pg_catalog.pg_get_constraintdef(oid),'octet_length')>0
    AND strpos(pg_catalog.pg_get_constraintdef(oid),'response')>0
    AND strpos(pg_catalog.pg_get_constraintdef(oid),'16384')>0)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='private.collection_share_terminal_rejections'::regclass AND contype='c'
    AND strpos(pg_catalog.pg_get_constraintdef(oid),'octet_length(request_hash) = 32')>0) THEN
  RAISE EXCEPTION 'db-contract-gate: invitation identity or bounded receipt integrity changed';
 END IF;

 -- Root ownership cannot be detached from the collection; publication relies
 -- on immediate membership foreign keys before its AFTER source guard.
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='private.collection_sharing_roots'::regclass AND contype='f'
    AND confrelid='public.user_word_lists'::regclass AND cardinality(conkey)=2
    AND NOT condeferrable AND NOT condeferred AND confdeltype='c')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='public.user_word_list_items'::regclass AND contype='f'
    AND confrelid='public.user_word_lists'::regclass AND NOT condeferrable AND NOT condeferred)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
   WHERE conrelid='public.user_word_list_items'::regclass AND contype='f'
    AND confrelid IN('public.user_word_lists'::regclass,'public.word_entries'::regclass)
    AND (condeferrable OR condeferred)) THEN
  RAISE EXCEPTION 'db-contract-gate: sharing owner/membership foreign-key fence changed';
 END IF;

 FOREACH relation IN ARRAY ARRAY[
  'private.live_collection_sharing_subscriptions_v1'::regclass,
  'private.shared_author_entry_memberships_v1'::regclass
 ] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF pg_catalog.has_table_privilege(role_name,relation,'SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_any_column_privilege(role_name,relation,'SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'db-contract-gate: sharing authority view exposed: %',relation;
   END IF;
  END LOOP;
 END LOOP;
 definition:=regexp_replace(pg_catalog.pg_get_viewdef('private.live_collection_sharing_subscriptions_v1'::regclass),'\s','','g');
 IF strpos(definition,'subscription.is_active')=0 OR strpos(definition,'root.is_open')=0
  OR strpos(definition,'subscription.access_lifetime=root.access_lifetime')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: sharing live-lifetime authority changed'; END IF;
 definition:=regexp_replace(pg_catalog.pg_get_viewdef('private.shared_author_entry_memberships_v1'::regclass),'\s','','g');
 IF strpos(definition,'active_word_entries')=0 OR strpos(definition,'dictionary.owner_user_id=scope.owner_user_id')=0
  OR strpos(definition,'entry.management_kind=''user''::text')=0
  OR strpos(definition,'dictionary.kind=''user''::text')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: selected author-entry authority changed'; END IF;

 FOREACH signature IN ARRAY ARRAY[
  'public.command_collection_share_v1(uuid,text,uuid,integer,text,boolean)'::regprocedure,
  'public.read_collection_share_command_v1(uuid)'::regprocedure,
  'public.preview_collection_share_v1(text)'::regprocedure,
  'public.read_collection_share_management_v1(uuid)'::regprocedure,
  'public.read_collection_share_forward_v1(uuid)'::regprocedure,
  'public.read_entry_note_v1(uuid)'::regprocedure,
  'public.write_entry_note_v1(uuid,bigint,text)'::regprocedure,
  'public.read_entry_note_material_v1(uuid[])'::regprocedure,
  'public.set_received_collection_labels_v1(uuid,bigint,uuid[])'::regprocedure,
  'public.read_received_collection_catalog_v1(text,text,text,uuid,jsonb,integer)'::regprocedure,
  'public.read_owned_shared_collection_catalog_v1(text,text,jsonb,integer)'::regprocedure,
  'public.read_collection_sharing_overview_v1()'::regprocedure,
  'public.read_owned_collection_publication_badges_v1(uuid[])'::regprocedure,
  'public.read_received_collection_source_v1(uuid)'::regprocedure,
  'public.read_personal_collection_catalog_v1(text,text,text,uuid,text,jsonb,integer)'::regprocedure,
  'public.read_received_collection_label_state_v1(uuid)'::regprocedure,
  'public.read_selected_collection_membership_v1(uuid,uuid[])'::regprocedure,
  'public.get_word_list_summary(uuid,uuid,text)'::regprocedure,
  'public.read_training_collection_catalog_v1(text,text,jsonb,integer)'::regprocedure,
  'public.read_training_collection_summaries_v1(uuid[],text)'::regprocedure
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature AND prosecdef
    AND proconfig @> ARRAY['search_path=pg_catalog, public, private, pg_temp'])
   OR NOT pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE')
   OR pg_catalog.has_function_privilege('anon',signature,'EXECUTE')
   OR pg_catalog.has_function_privilege('service_role',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: sharing authenticated RPC boundary changed: %',signature;
  END IF;
 END LOOP;

 FOREACH signature IN ARRAY ARRAY[
  'private.shared_collection_ids_v1(uuid)'::regprocedure,
  'private.shared_author_entry_ids_v1(uuid,uuid[])'::regprocedure,
  'private.can_read_shared_author_entry_v1(uuid,uuid)'::regprocedure,
  'private.entry_access_v1(uuid,uuid,text)'::regprocedure,
  'private.entry_payload_for_reader_v1(uuid,jsonb)'::regprocedure,
  'private.entry_payload_without_note_material_v1(uuid,jsonb)'::regprocedure,
  'private.shared_instructional_raw_v1(jsonb,text,integer)'::regprocedure,
  'private.begin_collection_share_command_v1(uuid,jsonb)'::regprocedure,
  'private.collection_share_command_core_v1(uuid,text,uuid,integer,text,boolean)'::regprocedure,
  'private.mutate_collection_share_v1(uuid,text,uuid,integer)'::regprocedure,
  'private.accept_collection_share_v1(uuid,text)'::regprocedure,
  'private.unsubscribe_collection_share_v1(uuid,uuid)'::regprocedure,
  'private.require_collection_sharing_writes_v1()'::regprocedure,
  'private.lock_sharing_author_scope_v1(uuid,boolean)'::regprocedure,
  'private.lock_shared_learning_source_v1(uuid,uuid)'::regprocedure,
  'private.entry_note_scope_material_v1(uuid,uuid[])'::regprocedure,
  'private.set_received_collection_labels_v1(uuid,bigint,uuid[])'::regprocedure,
  'private.generate_collection_share_code_v1()'::regprocedure,
  'private.guard_shared_collection_member_source_v1()'::regprocedure,
  'private.guard_shared_collection_delete_v1()'::regprocedure,
  'private.received_collection_training_available_v1(uuid,uuid,text)'::regprocedure,
  'private.training_collection_catalog_cohort_v1(uuid,text,text,uuid,text,integer,uuid[])'::regprocedure
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature
    AND EXISTS(SELECT 1 FROM unnest(proconfig) setting WHERE setting LIKE 'search_path=pg_catalog,%pg_temp'))
   OR pg_catalog.has_function_privilege('anon',signature,'EXECUTE')
   OR pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE')
   OR pg_catalog.has_function_privilege('service_role',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'db-contract-gate: sharing implementation helper exposed or path changed: %',signature;
  END IF;
 END LOOP;

 -- The preserved owner/curated summary delegate retains its installed path.
 signature:='private.get_word_list_summary_owner_base_v1(uuid,uuid,text)'::regprocedure;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature AND prosecdef
   AND proconfig @> ARRAY['search_path=public, pg_temp'])
  OR pg_catalog.has_function_privilege('anon',signature,'EXECUTE')
  OR pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE')
  OR pg_catalog.has_function_privilege('service_role',signature,'EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: preserved owner list-summary delegate exposed or changed'; END IF;

 -- Saved source-origin metadata is server-owned even after source deletion.
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid='public.user_training_scopes'::regclass AND attname='active_list_owner_user_id'
    AND atttypid='uuid'::regtype AND NOT attisdropped)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class
   WHERE oid='public.user_training_scopes'::regclass AND relrowsecurity)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.user_training_scopes'::regclass) THEN
  RAISE EXCEPTION 'db-contract-gate: saved training source-origin boundary changed'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF pg_catalog.has_table_privilege(role_name,'public.user_training_scopes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR pg_catalog.has_any_column_privilege(role_name,'public.user_training_scopes','SELECT,INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION 'db-contract-gate: raw training scope/source-owner metadata exposed'; END IF;
 END LOOP;
 definition:=pg_catalog.pg_get_functiondef('private.received_collection_training_available_v1(uuid,uuid,text)'::regprocedure);
 IF strpos(definition,'private.live_collection_sharing_subscriptions_v1')=0
  OR strpos(definition,'private.active_word_entries')=0
  OR strpos(definition,'entry.language_code=p_language_code')=0
  OR strpos(definition,'private.entry_access_v1(p_user_id,entry.id,''train'')')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: received training language/live authority changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.get_active_training_scope(uuid,text)'::regprocedure);
 IF strpos(definition,'p_user_id IS DISTINCT FROM (select auth.uid())')=0
  OR strpos(definition,'private.received_collection_training_available_v1')=0
  OR strpos(definition,'private.training_collection_catalog_cohort_v1(')=0
  OR strpos(definition,'v_result:=COALESCE(v_result, jsonb_build_object(')=0
  OR strpos(definition,'shared_collection_unavailable')=0 OR strpos(definition,'active_list_ownership')=0
  OR strpos(definition,'''active_list_owner_user_id''')>0
  OR strpos(definition,'to_jsonb(v_scope)')>0 OR strpos(definition,'row_to_json(v_scope)')>0 THEN
  RAISE EXCEPTION 'db-contract-gate: saved received selection/fallback/source privacy changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],integer)'::regprocedure);
 IF strpos(definition,'p_user_id IS DISTINCT FROM (select auth.uid())')=0
  OR strpos(definition,'private.received_collection_training_available_v1')=0
  OR strpos(definition,'private.training_collection_catalog_cohort_v1(')=0
  OR strpos(definition,'INTO v_list_owner_user_id')=0
  OR strpos(definition,'WHERE list.id=p_list_id FOR KEY SHARE NOWAIT')=0
  OR strpos(definition,'active_list_owner_user_id = excluded.active_list_owner_user_id')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: received selection authorization/source-parent fence changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.get_word_list_summary(uuid,uuid,text)'::regprocedure);
 IF strpos(definition,'private.get_word_list_summary_owner_base_v1')=0
  OR strpos(definition,'private.live_collection_sharing_subscriptions_v1')=0
  OR strpos(definition,'private.entry_access_v1(p_user_id,entry.id,''train'')')=0
  OR strpos(definition,'''ownership'',''received'',''editable'',false')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: received summary train authority/edit isolation changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('private.training_collection_catalog_cohort_v1(uuid,text,text,uuid,text,integer,uuid[])'::regprocedure);
 IF strpos(definition,'private.live_collection_sharing_subscriptions_v1')=0
  OR strpos(definition,'private.active_word_entries')=0
  OR strpos(definition,'public.can_access_dictionary(p_user_id,dictionary.id,''read'')')=0
  OR strpos(definition,'private.shared_author_entry_memberships_v1')=0
  OR strpos(definition,'count(DISTINCT member.language_code)')=0
  OR strpos(definition,'counts.language_count,0)>1 AND COALESCE(counts.item_count,0)>0')=0
  OR strpos(definition,'list.id=ANY(p_collection_ids)')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: bounded training source cohort/live train authority changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.read_training_collection_catalog_v1(text,text,jsonb,integer)'::regprocedure);
 IF strpos(definition,'principal uuid:=(select auth.uid())')=0
  OR strpos(definition,'p_limit NOT BETWEEN 1 AND 100')=0 OR strpos(definition,'length(query)>100')=0
  OR strpos(definition,'p_cursor->>''scope'' IS DISTINCT FROM fingerprint')=0
  OR strpos(definition,'private.training_collection_catalog_cohort_v1(principal,query,language')=0
  OR strpos(definition,'availableItemCount')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: paginated training source query/cursor/response fence changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.read_training_collection_summaries_v1(uuid[],text)'::regprocedure);
 IF strpos(definition,'principal uuid:=(select auth.uid())')=0
  OR strpos(definition,'cardinality(p_collection_ids)>100')=0
  OR strpos(definition,'private.training_collection_catalog_cohort_v1(principal,'''',language,NULL,NULL,100,p_collection_ids)')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: bounded saved training-reference projection changed'; END IF;

 definition:=pg_catalog.pg_get_functiondef('private.entry_access_v1(uuid,uuid,text)'::regprocedure);
 IF strpos(definition,'private.active_word_entries')=0 OR strpos(definition,'private.can_read_shared_author_entry_v1')=0
  OR strpos(definition,'public.can_browse_dictionary')=0 OR strpos(definition,'public.can_access_dictionary')=0
  OR strpos(definition,'p_mode IN (''browse'',''train'')')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: exact shared entry/archive/catalogue authority changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('private.can_read_shared_author_entry_v1(uuid,uuid)'::regprocedure);
 IF strpos(definition,'private.shared_author_entry_ids_v1(p_user_id,ARRAY[p_entry_id])')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: shared point lookup lost its bounded candidate'; END IF;
 definition:=pg_catalog.pg_get_functiondef('private.entry_payload_without_note_material_v1(uuid,jsonb)'::regprocedure);
 IF strpos(definition,'d.owner_user_id IS DISTINCT FROM p_user_id')=0
  OR strpos(definition,'private.shared_instructional_raw_v1')=0 OR strpos(definition,'key=ANY(ARRAY[')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: foreign instructional record/raw projection changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('private.entry_payload_for_reader_v1(uuid,jsonb)'::regprocedure);
 IF strpos(definition,'private.entry_payload_without_note_material_v1')=0
  OR strpos(definition,'private.entry_note_display_material_v1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: foreign instructional projection/note delegation changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.fetch_dictionary_entry_by_id_gated(uuid)'::regprocedure);
 IF strpos(definition,'private.entry_access_v1')=0 OR strpos(definition,'private.entry_payload_for_reader_v1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: exact article read lost shared authority/privacy projection'; END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.user_word_list_items'::regclass
   AND tgname='zz_shared_collection_member_source_guard' AND tgtype=29 AND tgenabled='O'
   AND tgfoid='private.guard_shared_collection_member_source_v1()'::regprocedure)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.user_word_lists'::regclass
   AND tgname='shared_collection_delete_author_fence' AND tgtype=11 AND tgenabled='O'
   AND tgfoid='private.guard_shared_collection_delete_v1()'::regprocedure)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.user_word_notes'::regclass
   AND tgname='user_word_notes_lifecycle_revision' AND tgtype=29 AND tgenabled='O'
   AND tgfoid='private.advance_user_word_note_revision_v1()'::regprocedure) THEN
  RAISE EXCEPTION 'db-contract-gate: sharing source/delete/note lifecycle trigger changed';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conrelid='private.training_current_card_permits'::regclass
   AND conname='training_permit_shared_author_pair' AND contype='c'
   AND strpos(pg_catalog.pg_get_constraintdef(oid),'shared_author_dictionary_id IS NULL')>0
   AND strpos(pg_catalog.pg_get_constraintdef(oid),'shared_author_user_id IS NULL')>0) THEN
  RAISE EXCEPTION 'db-contract-gate: displayed shared-card source pair changed'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF pg_catalog.has_table_privilege(role_name,'public.user_word_notes','INSERT,UPDATE,DELETE,TRUNCATE')
   OR pg_catalog.has_any_column_privilege(role_name,'public.user_word_notes','INSERT,UPDATE') THEN
   RAISE EXCEPTION 'db-contract-gate: unsequenced note writes exposed'; END IF;
 END LOOP;

 -- Inspect metadata only: do not toggle the operational DB gate. A postflight
 -- must remain valid after approved activation and during a write rollback.
 IF (SELECT count(*) FROM private.collection_sharing_rollout WHERE singleton)<>1 THEN
  RAISE EXCEPTION 'db-contract-gate: sharing write-control singleton missing'; END IF;
 definition:=pg_catalog.pg_get_functiondef('private.require_collection_sharing_writes_v1()'::regprocedure);
 IF strpos(definition,'auth.uid()')=0 OR strpos(definition,'FOR SHARE')=0
  OR strpos(definition,'new_writes_enabled')=0 OR strpos(definition,'sharing_writes_disabled')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: sharing authoritative write gate changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('private.collection_share_command_core_v1(uuid,text,uuid,integer,text,boolean)'::regprocedure);
 IF strpos(definition,'private.begin_collection_share_command_v1')=0 OR strpos(definition,'p_reconcile_only')=0
  OR strpos(definition,'p_action NOT IN(''close'',''unsubscribe'')')=0
  OR strpos(definition,'private.require_collection_sharing_writes_v1()')=0
  OR strpos(definition,'private.begin_collection_share_command_v1')>strpos(definition,'private.require_collection_sharing_writes_v1()') THEN
  RAISE EXCEPTION 'db-contract-gate: sharing replay/close/unsubscribe write rollback changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.command_collection_share_v1(uuid,text,uuid,integer,text,boolean)'::regprocedure);
 IF strpos(definition,'request_hash')=0 OR strpos(definition,'share_operation_conflict')=0
  OR strpos(definition,'collection_share_terminal_rejections')=0 OR strpos(definition,'private.collection_share_command_core_v1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: durable terminal rejection/canonical intent fence changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.write_entry_note_v1(uuid,bigint,text)'::regprocedure);
 IF strpos(definition,'private.require_collection_sharing_writes_v1()')=0
  OR strpos(definition,'private.lock_shared_learning_source_v1')=0
  OR strpos(definition,'revision IS DISTINCT FROM p_expected_revision')=0 OR strpos(definition,'note_changed')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: note write admission/CAS/source fence changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.set_received_collection_labels_v1(uuid,bigint,uuid[])'::regprocedure);
 IF strpos(definition,'private.require_collection_sharing_writes_v1()')=0
  OR strpos(definition,'private.set_received_collection_labels_v1')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: received placement write gate changed'; END IF;
 definition:=pg_catalog.pg_get_functiondef('public.acknowledge_current_training_card_v1(uuid,uuid,uuid,text,bigint,text,uuid,text)'::regprocedure);
 IF strpos(definition,'shared.root_id=ANY(issuance_roots)')=0
  OR strpos(definition,'shared_author_dictionary_id')=0 OR strpos(definition,'shared_author_user_id')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: exact displayed shared-card issuance fence changed'; END IF;
END;
$sharing_contract$;
