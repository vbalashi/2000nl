BEGIN;
CREATE FUNCTION private.guard_label_author_admission_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE author uuid;
BEGIN
 author:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 -- Label/catalog tuples may already be held by the owner organization RPC.
 -- Never wait for author admission in that inverse order.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||author::text,0)) THEN
  RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001'; END IF;
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
  RAISE EXCEPTION 'invalid_label_operation' USING ERRCODE='22023'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_label_author_admission_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER label_author_admission BEFORE INSERT OR UPDATE OR DELETE ON private.collection_labels
 FOR EACH ROW EXECUTE FUNCTION private.guard_label_author_admission_v1();
CREATE TRIGGER label_assignment_author_admission BEFORE INSERT OR UPDATE OR DELETE ON private.collection_label_assignments
 FOR EACH ROW EXECUTE FUNCTION private.guard_label_author_admission_v1();
COMMIT;
