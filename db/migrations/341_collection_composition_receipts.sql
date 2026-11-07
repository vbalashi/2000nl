BEGIN;
CREATE FUNCTION public.read_collection_composition_plan_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan private.collection_composition_plans%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.collection_composition_plans WHERE id=p_plan_id AND user_id=principal;
 IF NOT FOUND THEN RETURN jsonb_build_object('planId',p_plan_id,'status','unknown'); END IF;
 IF plan.committed THEN RETURN jsonb_build_object('planId',plan.id,'collectionId',plan.collection_id,'status','committed'); END IF;
 RETURN jsonb_build_object('planId',plan.id,'status',CASE WHEN plan.expires_at<now() THEN 'expired' ELSE 'pending' END);
END;
$$;
REVOKE ALL ON FUNCTION public.read_collection_composition_plan_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_collection_composition_plan_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_collection_composition_v1(uuid,jsonb),public.confirm_collection_composition_v1(uuid) TO authenticated;
COMMIT;
