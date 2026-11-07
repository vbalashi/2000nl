BEGIN;
CREATE OR REPLACE FUNCTION public.prepare_collection_composition_v1(p_collection_id uuid,p_operation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); plan_id uuid; audience jsonb; revision text;
BEGIN
 IF principal IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_word_lists WHERE id=p_collection_id AND user_id=principal) THEN
  RAISE EXCEPTION 'collection_unavailable' USING ERRCODE='42501'; END IF;
 IF p_operation->>'action' IS NULL OR p_operation->>'action' NOT IN('add','remove','delete') OR jsonb_typeof(p_operation) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'invalid_collection_operation' USING ERRCODE='22023'; END IF;
 IF (p_operation->>'action'='delete' AND p_operation-ARRAY['action']<>'{}'::jsonb)
 OR (p_operation->>'action'='add' AND (p_operation-ARRAY['action','entryId']<>'{}'::jsonb OR jsonb_typeof(p_operation->'entryId') IS DISTINCT FROM 'string'))
 OR (p_operation->>'action'='remove' AND (p_operation-ARRAY['action','entryIds']<>'{}'::jsonb OR jsonb_typeof(p_operation->'entryIds') IS DISTINCT FROM 'array')) THEN
  RAISE EXCEPTION 'invalid_collection_operation' USING ERRCODE='22023'; END IF;
 IF p_operation->>'action'='add' THEN
  PERFORM (p_operation->>'entryId')::uuid;
 ELSIF p_operation->>'action'='remove' THEN
  IF jsonb_array_length(p_operation->'entryIds') NOT BETWEEN 1 AND 500 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_operation->'entryIds') value WHERE jsonb_typeof(value)<>'string') THEN
   RAISE EXCEPTION 'invalid_collection_operation' USING ERRCODE='22023'; END IF;
  PERFORM value::uuid FROM jsonb_array_elements_text(p_operation->'entryIds');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('collection-composition-plan:'||principal::text,0));
 audience:=private.collection_audience_recipients_v1(principal,p_collection_id);
 revision:=private.collection_composition_revision_v1(principal,p_collection_id);
 DELETE FROM private.collection_composition_plans WHERE user_id=principal AND expires_at<now();
 IF (SELECT count(*) FROM private.collection_composition_plans WHERE user_id=principal)>=100 THEN RAISE EXCEPTION 'collection_plan_limit' USING ERRCODE='22023'; END IF;
 INSERT INTO private.collection_composition_plans(user_id,collection_id,operation,revision,audience)
 VALUES(principal,p_collection_id,p_operation,revision,audience) RETURNING id INTO plan_id;
 RETURN jsonb_build_object('planId',plan_id,'collectionId',p_collection_id,'audience',audience,'action',p_operation->>'action');
END;
$$;
COMMIT;
