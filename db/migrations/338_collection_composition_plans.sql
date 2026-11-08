BEGIN;
CREATE TABLE private.collection_composition_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 collection_id uuid NOT NULL,operation jsonb NOT NULL,revision text NOT NULL,audience jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',committed boolean NOT NULL DEFAULT false
);
ALTER TABLE private.collection_composition_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.collection_composition_plans FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.collection_composition_revision_v1(p_owner uuid,p_collection uuid) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('audience',private.collection_audience_recipients_v1(p_owner,p_collection),
 'members',COALESCE((SELECT jsonb_agg(word_id ORDER BY word_id) FROM public.user_word_list_items WHERE list_id=p_collection),'[]'::jsonb))::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION private.collection_composition_revision_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.prepare_collection_composition_v1(p_collection_id uuid,p_operation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan_id uuid; audience jsonb; revision text;
BEGIN
 IF principal IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_word_lists WHERE id=p_collection_id AND user_id=principal) THEN
  RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 IF p_operation->>'action' IS NULL OR p_operation->>'action' NOT IN('add','remove','delete') OR jsonb_typeof(p_operation) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'invalid_collection_operation' USING ERRCODE='22023'; END IF;
 audience:=private.collection_audience_recipients_v1(principal,p_collection_id);
 revision:=private.collection_composition_revision_v1(principal,p_collection_id);
 DELETE FROM private.collection_composition_plans WHERE user_id=principal AND expires_at<now();
 IF (SELECT count(*) FROM private.collection_composition_plans WHERE user_id=principal)>=100 THEN RAISE EXCEPTION 'collection_plan_limit' USING ERRCODE='22023'; END IF;
 INSERT INTO private.collection_composition_plans(user_id,collection_id,operation,revision,audience)
 VALUES(principal,p_collection_id,p_operation,revision,audience) RETURNING id INTO plan_id;
 RETURN jsonb_build_object('planId',plan_id,'collectionId',p_collection_id,'audience',audience,'action',p_operation->>'action');
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_collection_composition_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
