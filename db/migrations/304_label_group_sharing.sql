-- Fresh installations only. Group identity is independent of collection identity.
BEGIN;
CREATE TABLE private.label_sharing_roots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 label_id uuid NOT NULL UNIQUE REFERENCES private.collection_labels(id) ON DELETE CASCADE,
 is_open boolean NOT NULL DEFAULT false,
 access_lifetime uuid NOT NULL DEFAULT gen_random_uuid(),
 revision integer NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 2147483646),
 invitation_code text UNIQUE,
 CHECK ((is_open AND invitation_code IS NOT NULL) OR (NOT is_open AND invitation_code IS NULL))
);
CREATE TABLE private.label_sharing_subscriptions (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 root_id uuid NOT NULL REFERENCES private.label_sharing_roots(id) ON DELETE CASCADE,
 access_lifetime uuid NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,root_id)
);
ALTER TABLE private.label_sharing_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.label_sharing_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.label_sharing_roots,private.label_sharing_subscriptions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_label_share_v1(p_label_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); root private.label_sharing_roots%rowtype;
BEGIN
 IF principal IS NULL OR NOT EXISTS(SELECT 1 FROM private.collection_labels WHERE id=p_label_id AND user_id=principal) THEN
  RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO root FROM private.label_sharing_roots WHERE label_id=p_label_id AND owner_user_id=principal;
 RETURN jsonb_build_object('labelId',p_label_id,'isOpen',COALESCE(root.is_open,false),'revision',COALESCE(root.revision,0),
  'invitationCode',root.invitation_code,'subscriberCount',(SELECT count(*) FROM private.label_sharing_subscriptions s
   WHERE s.root_id=root.id AND s.is_active AND root.is_open AND s.access_lifetime=root.access_lifetime));
END;
$$;

CREATE FUNCTION public.mutate_label_share_v1(p_label_id uuid,p_action text,p_expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); root private.label_sharing_roots%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN('open','rotate','close') OR p_expected_revision IS NULL
  OR p_expected_revision NOT BETWEEN 0 AND 2147483645 THEN RAISE EXCEPTION 'invalid_share_command' USING ERRCODE='22023'; END IF;
 IF p_action<>'close' THEN PERFORM private.require_collection_sharing_writes_v1(); END IF;
 PERFORM private.lock_sharing_author_scope_v1(principal,true);
 PERFORM 1 FROM private.collection_labels WHERE id=p_label_id AND user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO private.label_sharing_roots(owner_user_id,label_id) VALUES(principal,p_label_id) ON CONFLICT(label_id) DO NOTHING;
 SELECT * INTO root FROM private.label_sharing_roots WHERE label_id=p_label_id AND owner_user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 IF root.revision<>p_expected_revision THEN RAISE EXCEPTION 'share_revision_conflict' USING ERRCODE='40001'; END IF;
 IF p_action='open' AND NOT root.is_open THEN
  IF EXISTS(SELECT 1 FROM private.label_subtree_borrowed_entries_v1(principal,p_label_id)) THEN
   RAISE EXCEPTION 'share_copy_required' USING ERRCODE='22023'; END IF;
  UPDATE private.label_sharing_roots SET is_open=true,access_lifetime=gen_random_uuid(),
   invitation_code=private.generate_collection_share_code_v1(),revision=revision+1 WHERE id=root.id;
 ELSIF p_action='rotate' THEN
  IF NOT root.is_open THEN RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
  UPDATE private.label_sharing_roots SET invitation_code=private.generate_collection_share_code_v1(),revision=revision+1 WHERE id=root.id;
 ELSIF p_action='close' AND root.is_open THEN
  UPDATE private.label_sharing_roots SET is_open=false,invitation_code=NULL,access_lifetime=gen_random_uuid(),revision=revision+1 WHERE id=root.id;
 END IF;
 RETURN public.read_label_share_v1(p_label_id);
END;
$$;
REVOKE ALL ON FUNCTION public.read_label_share_v1(uuid),public.mutate_label_share_v1(uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_label_share_v1(uuid),public.mutate_label_share_v1(uuid,text,integer) TO authenticated;

CREATE FUNCTION public.preview_label_share_v1(p_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); root private.label_sharing_roots%rowtype; added boolean;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO root FROM private.label_sharing_roots WHERE invitation_code=p_code AND is_open;
 IF NOT FOUND THEN RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 added:=root.owner_user_id=principal OR EXISTS(SELECT 1 FROM private.label_sharing_subscriptions
  WHERE user_id=principal AND root_id=root.id AND is_active AND access_lifetime=root.access_lifetime);
 RETURN jsonb_build_object('labelId',root.label_id,'name',(SELECT name FROM private.collection_labels WHERE id=root.label_id),
  'collectionCount',(SELECT count(*) FROM private.label_subtree_owned_collections_v1(root.owner_user_id,root.label_id)),
  'alreadyAdded',added,'role',CASE WHEN root.owner_user_id=principal THEN 'owner' WHEN added THEN 'viewer' END);
END;
$$;

CREATE FUNCTION public.accept_label_share_v1(p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); root private.label_sharing_roots%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM private.require_collection_sharing_writes_v1();
 SELECT * INTO root FROM private.label_sharing_roots WHERE invitation_code=p_code AND is_open;
 IF NOT FOUND THEN RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_sharing_author_scope_v1(root.owner_user_id,true);
 SELECT * INTO root FROM private.label_sharing_roots WHERE id=root.id AND invitation_code=p_code AND is_open FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 IF root.owner_user_id<>principal THEN
  INSERT INTO private.label_sharing_subscriptions(user_id,root_id,access_lifetime)
   VALUES(principal,root.id,root.access_lifetime)
  ON CONFLICT(user_id,root_id) DO UPDATE SET access_lifetime=excluded.access_lifetime,is_active=true,
   accepted_at=CASE WHEN label_sharing_subscriptions.is_active AND label_sharing_subscriptions.access_lifetime=excluded.access_lifetime
    THEN label_sharing_subscriptions.accepted_at ELSE now() END;
 END IF;
 RETURN public.preview_label_share_v1(p_code);
END;
$$;

CREATE FUNCTION public.unsubscribe_label_share_v1(p_label_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); root private.label_sharing_roots%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT r.* INTO root FROM private.label_sharing_roots r JOIN private.label_sharing_subscriptions s ON s.root_id=r.id
  WHERE r.label_id=p_label_id AND s.user_id=principal;
 IF FOUND THEN
  PERFORM private.lock_sharing_author_scope_v1(root.owner_user_id,true);
  UPDATE private.label_sharing_subscriptions SET is_active=false WHERE user_id=principal AND root_id=root.id;
 END IF;
 RETURN jsonb_build_object('labelId',p_label_id,'subscribed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_label_share_v1(text),public.accept_label_share_v1(text),public.unsubscribe_label_share_v1(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_label_share_v1(text),public.accept_label_share_v1(text),public.unsubscribe_label_share_v1(uuid) TO authenticated;

-- Closed internal projection. Integration with material authority is performed
-- only after all authority writers participate in the author admission fence.
CREATE VIEW private.live_label_sharing_collections_v1 AS
 SELECT subscription.user_id,scope.collection_id,root.owner_user_id,root.id AS root_id,root.label_id,root.access_lifetime
 FROM private.label_sharing_subscriptions subscription
 JOIN private.label_sharing_roots root ON root.id=subscription.root_id
 CROSS JOIN LATERAL private.label_subtree_owned_collections_v1(root.owner_user_id,root.label_id) scope
 WHERE subscription.is_active AND root.is_open AND subscription.access_lifetime=root.access_lifetime;
REVOKE ALL ON private.live_label_sharing_collections_v1 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.read_label_sharing_catalog_v1() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid();
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('owned',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'labelId',label.id,'name',label.name,'isOpen',COALESCE(root.is_open,false),'revision',COALESCE(root.revision,0),
  'collectionCount',(SELECT count(*) FROM private.label_subtree_owned_collections_v1(principal,label.id))) ORDER BY label.id)
 FROM private.collection_labels label LEFT JOIN private.label_sharing_roots root ON root.label_id=label.id AND root.owner_user_id=principal
 WHERE label.user_id=principal),'[]'::jsonb),
 'received',COALESCE((SELECT jsonb_agg(jsonb_build_object('labelId',root.label_id,'name',label.name,
  'collectionCount',(SELECT count(*) FROM private.label_subtree_owned_collections_v1(root.owner_user_id,root.label_id))) ORDER BY root.label_id)
 FROM private.label_sharing_subscriptions subscription JOIN private.label_sharing_roots root ON root.id=subscription.root_id
 JOIN private.collection_labels label ON label.id=root.label_id AND label.user_id=root.owner_user_id
 WHERE subscription.user_id=principal AND subscription.is_active AND root.is_open
  AND subscription.access_lifetime=root.access_lifetime AND root.owner_user_id<>principal),'[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.read_label_sharing_catalog_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_label_sharing_catalog_v1() TO authenticated;

-- One opaque code intake. GET/preview performs no membership write.
CREATE FUNCTION public.preview_shared_resource_v1(p_code text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); is_group boolean; is_collection boolean;
BEGIN
 IF principal IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=principal) THEN
  RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_code IS NULL OR p_code !~ '^[0-9A-HJKMNP-TV-Z]{26}$' THEN
  RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM private.label_sharing_roots WHERE is_open AND invitation_code=p_code) INTO is_group;
 SELECT EXISTS(SELECT 1 FROM private.collection_sharing_invitations invitation
  JOIN private.collection_sharing_roots root ON root.id=invitation.root_id
  WHERE root.is_open AND invitation.role='viewer' AND invitation.code=p_code) INTO is_collection;
 -- An ambiguous code must never select a different resource on retry.
 IF is_group=is_collection THEN RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 IF is_group THEN RETURN jsonb_build_object('kind','label','preview',public.preview_label_share_v1(p_code)); END IF;
 RETURN jsonb_build_object('kind','collection','preview',public.preview_collection_share_v1(p_code));
END;
$$;
REVOKE ALL ON FUNCTION public.preview_shared_resource_v1(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preview_shared_resource_v1(text) TO authenticated;

CREATE FUNCTION public.read_label_share_collections_v1(p_label_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); root private.label_sharing_roots%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_catalog_request' USING ERRCODE='22023'; END IF;
 SELECT * INTO root FROM private.label_sharing_roots WHERE label_id=p_label_id;
 IF NOT FOUND OR (root.owner_user_id<>principal AND (NOT root.is_open OR NOT EXISTS(
  SELECT 1 FROM private.label_sharing_subscriptions WHERE root_id=root.id AND user_id=principal
   AND is_active AND access_lifetime=root.access_lifetime))) THEN
  RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 RETURN (WITH candidates AS MATERIALIZED (
  SELECT list.id,list.name FROM private.label_subtree_owned_collections_v1(root.owner_user_id,root.label_id) scope
  JOIN public.user_word_lists list ON list.id=scope.collection_id
  WHERE p_after IS NULL OR list.id>p_after ORDER BY list.id LIMIT p_limit+1
 ), page AS MATERIALIZED (SELECT * FROM candidates ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('labelId',p_label_id,'collections',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'collectionId',id,'name',name) ORDER BY id) FROM page),'[]'::jsonb),
  'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>p_limit THEN (SELECT id FROM page ORDER BY id DESC LIMIT 1) END));
END;
$$;
REVOKE ALL ON FUNCTION public.read_label_share_collections_v1(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_label_share_collections_v1(uuid,uuid,integer) TO authenticated;
COMMIT;
