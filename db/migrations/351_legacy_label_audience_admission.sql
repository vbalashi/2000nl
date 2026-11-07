BEGIN;
CREATE OR REPLACE FUNCTION public.mutate_collection_labels_v1(p_user_id uuid,p_expected_revision bigint,p_operation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF p_user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM private.lock_sharing_author_scope_v1(p_user_id,true);
 IF EXISTS(SELECT 1 FROM private.label_sharing_roots WHERE owner_user_id=p_user_id AND is_open) THEN
  RAISE EXCEPTION 'label_audience_confirmation_required' USING ERRCODE='40001'; END IF;
 RETURN private.mutate_collection_labels_core_v1(p_user_id,p_expected_revision,p_operation);
END;
$$;
COMMIT;
