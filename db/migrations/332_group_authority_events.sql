BEGIN;
CREATE FUNCTION private.broadcast_label_share_root_hint_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE target_root uuid; owner uuid; recipient uuid;
BEGIN
 target_root:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 owner:=CASE WHEN TG_OP='DELETE' THEN OLD.owner_user_id ELSE NEW.owner_user_id END;
 -- BEFORE DELETE/UPDATE retains the departing lifetime's recipients.
 FOR recipient IN SELECT owner UNION SELECT user_id FROM private.label_sharing_subscriptions WHERE root_id=target_root AND is_active LOOP
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'collections.changed',NULL,NULL,txid_current()::text);
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'notes.changed',NULL,NULL,txid_current()::text);
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE FUNCTION private.broadcast_label_share_subscription_hint_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE recipient uuid; target uuid; subscriber uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.root_id ELSE NEW.root_id END;
 subscriber:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 FOR recipient IN SELECT subscriber UNION SELECT owner_user_id FROM private.label_sharing_roots WHERE id=target LOOP
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'collections.changed',NULL,NULL,txid_current()::text);
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'notes.changed',NULL,NULL,txid_current()::text);
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.broadcast_label_share_root_hint_v1(),private.broadcast_label_share_subscription_hint_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER label_share_root_hint BEFORE UPDATE OR DELETE ON private.label_sharing_roots FOR EACH ROW EXECUTE FUNCTION private.broadcast_label_share_root_hint_v1();
CREATE TRIGGER label_share_subscription_hint AFTER INSERT OR UPDATE OR DELETE ON private.label_sharing_subscriptions FOR EACH ROW EXECUTE FUNCTION private.broadcast_label_share_subscription_hint_v1();

CREATE FUNCTION private.broadcast_label_author_catalog_hint_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE owner uuid; recipient uuid;
BEGIN
 owner:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 -- Include all active subscribers of this author, so a departing subtree is
 -- invalidated even though its collection IDs disappear after the mutation.
 FOR recipient IN SELECT owner UNION SELECT subscription.user_id
  FROM private.label_sharing_subscriptions subscription JOIN private.label_sharing_roots root ON root.id=subscription.root_id
  WHERE root.owner_user_id=owner AND subscription.is_active AND root.is_open AND subscription.access_lifetime=root.access_lifetime LOOP
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'collections.changed',NULL,NULL,txid_current()::text);
  PERFORM private.send_app_event_v1('app:user:'||recipient::text,'notes.changed',NULL,NULL,txid_current()::text);
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.broadcast_label_author_catalog_hint_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER label_author_catalog_hint BEFORE INSERT OR UPDATE OR DELETE ON private.collection_labels
 FOR EACH ROW EXECUTE FUNCTION private.broadcast_label_author_catalog_hint_v1();
CREATE TRIGGER label_assignment_catalog_hint BEFORE INSERT OR UPDATE OR DELETE ON private.collection_label_assignments
 FOR EACH ROW EXECUTE FUNCTION private.broadcast_label_author_catalog_hint_v1();
COMMIT;
