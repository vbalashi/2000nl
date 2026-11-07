BEGIN;
CREATE FUNCTION public.read_label_organization_plan_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan private.label_organization_plans%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.label_organization_plans WHERE id=p_plan_id AND user_id=principal;
 IF NOT FOUND THEN RETURN jsonb_build_object('planId',p_plan_id,'status','unknown'); END IF;
 IF plan.committed_result IS NOT NULL THEN RETURN jsonb_build_object('planId',p_plan_id,'status','committed','result',plan.committed_result); END IF;
 RETURN jsonb_build_object('planId',p_plan_id,'status',CASE WHEN plan.expires_at<now() THEN 'expired' ELSE 'pending' END);
END;
$$;
REVOKE ALL ON FUNCTION public.read_label_organization_plan_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_label_organization_plan_v1(uuid) TO authenticated;
COMMIT;
