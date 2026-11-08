BEGIN;
CREATE FUNCTION public.read_label_share_references_v1(p_label_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); root private.label_sharing_roots%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO root FROM private.label_sharing_roots WHERE label_id=p_label_id;
 IF NOT FOUND OR (root.owner_user_id<>principal AND (NOT root.is_open OR NOT EXISTS(
  SELECT 1 FROM private.label_sharing_subscriptions WHERE root_id=root.id AND user_id=principal AND is_active AND access_lifetime=root.access_lifetime))) THEN
  RAISE EXCEPTION 'share_unavailable' USING ERRCODE='42501'; END IF;
 RETURN (WITH RECURSIVE labels AS (
  SELECT id FROM private.collection_labels WHERE id=root.label_id AND user_id=root.owner_user_id
  UNION SELECT child.id FROM private.collection_labels child JOIN labels parent ON child.parent_id=parent.id WHERE child.user_id=root.owner_user_id
 ), placements AS (
  SELECT DISTINCT placement.collection_id FROM private.received_collection_label_placements placement
  JOIN labels ON labels.id=placement.label_id WHERE placement.user_id=root.owner_user_id
 )
 SELECT jsonb_build_object('labelId',p_label_id,'references',COALESCE(jsonb_agg(jsonb_build_object(
  'collectionId',list.id,'name',list.name,'invitationCode',invitation.code) ORDER BY list.id),'[]'::jsonb))
 FROM placements reference JOIN public.user_word_lists list ON list.id=reference.collection_id
 JOIN private.collection_sharing_roots original ON original.collection_id=list.id AND original.is_open AND original.owner_user_id<>root.owner_user_id
 JOIN private.collection_sharing_subscriptions accepted ON accepted.root_id=original.id AND accepted.user_id=root.owner_user_id AND accepted.is_active AND accepted.access_lifetime=original.access_lifetime
 JOIN private.collection_sharing_invitations invitation ON invitation.root_id=original.id AND invitation.role='viewer'
  AND invitation.code=accepted.accepted_invitation_code AND invitation.generation=accepted.accepted_invitation_generation);
END;
$$;
REVOKE ALL ON FUNCTION public.read_label_share_references_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_label_share_references_v1(uuid) TO authenticated;
COMMIT;
