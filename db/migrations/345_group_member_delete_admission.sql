BEGIN;
CREATE OR REPLACE FUNCTION private.guard_group_collection_member_source_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE author uuid; target uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.list_id ELSE NEW.list_id END;
 SELECT user_id INTO author FROM public.user_word_lists WHERE id=target;
 IF author IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 -- Membership writers already hold the member tuple. Try admission instead of
 -- waiting in reverse order against a group composition transaction.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-author-scope:'||author::text,0)) THEN
  RAISE EXCEPTION 'share_retry_required' USING ERRCODE='40001'; END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM private.label_sharing_roots root
  CROSS JOIN LATERAL private.label_subtree_owned_collections_v1(author,root.label_id) scope
  WHERE root.owner_user_id=author AND root.is_open AND scope.collection_id=target)
 AND EXISTS(SELECT 1 FROM public.word_entries entry JOIN public.dictionaries dictionary ON dictionary.id=entry.dictionary_id
  WHERE entry.id=NEW.word_id AND dictionary.kind='user' AND dictionary.owner_user_id IS DISTINCT FROM author) THEN
  RAISE EXCEPTION 'share_copy_required' USING ERRCODE='22023'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_group_collection_member_source_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER group_collection_member_source_guard ON public.user_word_list_items;
CREATE TRIGGER group_collection_member_source_guard AFTER INSERT OR UPDATE OR DELETE ON public.user_word_list_items
 FOR EACH ROW EXECUTE FUNCTION private.guard_group_collection_member_source_v1();
COMMIT;
