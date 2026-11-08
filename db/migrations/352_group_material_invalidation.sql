BEGIN;
CREATE FUNCTION private.broadcast_group_collection_material_v1(p_collections uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE recipient uuid;
BEGIN
 FOR recipient IN SELECT DISTINCT path.user_id FROM private.live_label_sharing_collections_v1 path
  WHERE path.collection_id=ANY(p_collections) LOOP
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'collections.changed',NULL,NULL,txid_current()::text);
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'notes.changed',NULL,NULL,txid_current()::text);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.broadcast_group_collection_material_v1(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.broadcast_collection_list_hint_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE root record;
BEGIN
 IF NEW IS NOT DISTINCT FROM OLD THEN PERFORM private.broadcast_group_collection_material_v1(ARRAY[NEW.id]);
 RETURN NEW; END IF;
 FOR root IN SELECT r.* FROM private.collection_sharing_roots r WHERE r.collection_id=NEW.id LOOP
  PERFORM private.broadcast_collection_material_hint_v1(root.id,root.owner_user_id,root.access_lifetime,root.is_open);
 END LOOP;
 PERFORM private.broadcast_group_collection_material_v1(ARRAY[NEW.id]);
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION private.broadcast_collection_member_hint_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE lists uuid[]; root record; principal uuid;
BEGIN
 lists:=CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.list_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.list_id] ELSE ARRAY[OLD.list_id,NEW.list_id] END;
 FOR principal IN SELECT DISTINCT user_id FROM public.user_word_lists WHERE id=ANY(lists) LOOP
  PERFORM private.send_app_event_v1('app:user:'||principal::text,'collections.changed',NULL,NULL,txid_current()::text);
 END LOOP;
 FOR root IN SELECT r.* FROM private.collection_sharing_roots r WHERE r.collection_id=ANY(lists) LOOP
  PERFORM private.broadcast_collection_material_hint_v1(root.id,root.owner_user_id,root.access_lifetime,root.is_open);
 END LOOP;
 PERFORM private.broadcast_group_collection_material_v1(lists);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION private.broadcast_entry_note_hint_v1(p_owner uuid, p_entry uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE recipient uuid;
BEGIN
 FOR recipient IN
  SELECT p_owner WHERE p_owner IS NOT NULL
  UNION
  SELECT scope.user_id FROM private.live_collection_access_paths_v1 scope
  JOIN public.user_word_list_items item ON item.list_id=scope.collection_id
  WHERE scope.owner_user_id=p_owner AND item.word_id=p_entry
    AND private.entry_access_v1(scope.user_id,p_entry,'browse')
 LOOP
  -- Deliberately no entry/note/owner/text in payload. Domain-wide coalescing
  -- remains correct when several notes change in the same transaction.
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'notes.changed',NULL,NULL,txid_current()::text);
 END LOOP;
END;
$$;
CREATE OR REPLACE FUNCTION private.broadcast_shared_entry_material_hint_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE root record;
BEGIN
 IF TG_OP='UPDATE' AND NEW.content_version=OLD.content_version AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN RETURN NEW; END IF;
 FOR root IN SELECT r.* FROM public.user_word_list_items item
  JOIN private.collection_sharing_roots r ON r.collection_id=item.list_id WHERE item.word_id=OLD.id LOOP
  PERFORM private.broadcast_collection_material_hint_v1(root.id,root.owner_user_id,root.access_lifetime,root.is_open);
 END LOOP;
 PERFORM private.broadcast_group_collection_material_v1(ARRAY(SELECT list_id FROM public.user_word_list_items WHERE word_id=OLD.id));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
COMMIT;
