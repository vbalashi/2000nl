BEGIN;
CREATE TABLE private.label_organization_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 catalog_revision bigint NOT NULL,
 operation jsonb NOT NULL,
 audience_revision text NOT NULL,
 preview jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 committed_result jsonb
);
ALTER TABLE private.label_organization_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.label_organization_plans FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.prepare_label_organization_v1(p_expected_catalog_revision bigint,p_operation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); preview jsonb; plan_id uuid;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('label-organization-plan:'||principal::text,0));
 DELETE FROM private.label_organization_plans WHERE user_id=principal AND expires_at<now();
 IF (SELECT count(*) FROM private.label_organization_plans WHERE user_id=principal)>=100 THEN
  RAISE EXCEPTION 'label_catalog_limit' USING ERRCODE='22023'; END IF;
 preview:=public.preview_label_organization_v1(p_expected_catalog_revision,p_operation);
 INSERT INTO private.label_organization_plans(user_id,catalog_revision,operation,audience_revision,preview)
 VALUES(principal,p_expected_catalog_revision,p_operation,preview->>'audienceRevision',preview) RETURNING id INTO plan_id;
 RETURN preview||jsonb_build_object('planId',plan_id);
END;
$$;
CREATE FUNCTION public.confirm_label_organization_v1(p_plan_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan private.label_organization_plans%rowtype; result jsonb;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM private.label_organization_plans WHERE id=p_plan_id AND user_id=principal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'label_plan_unavailable' USING ERRCODE='42501'; END IF;
 IF plan.committed_result IS NOT NULL THEN RETURN plan.committed_result; END IF;
 IF plan.expires_at<now() THEN RAISE EXCEPTION 'label_audience_changed' USING ERRCODE='40001'; END IF;
 result:=public.commit_label_organization_v1(plan.catalog_revision,plan.operation,plan.audience_revision);
 UPDATE private.label_organization_plans SET committed_result=result WHERE id=plan.id;
 RETURN result;
END;
$$;
-- Closed until old mutation entry points enforce the same confirmation boundary.
REVOKE ALL ON FUNCTION public.prepare_label_organization_v1(bigint,jsonb),public.confirm_label_organization_v1(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
