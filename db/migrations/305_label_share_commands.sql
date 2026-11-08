BEGIN;
CREATE TABLE private.label_share_command_receipts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL,
 request jsonb NOT NULL,
 response jsonb NOT NULL,
 PRIMARY KEY(user_id,operation_id)
);
ALTER TABLE private.label_share_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.label_share_command_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.command_label_share_v1(p_operation_id uuid,p_command jsonb,p_reconcile_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); receipt private.label_share_command_receipts%rowtype; action text; response jsonb;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_reconcile_only IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'invalid_share_command' USING ERRCODE='22023'; END IF;
 action:=p_command->>'action';
 IF action IS NULL OR action NOT IN('open','rotate','close','accept','unsubscribe') THEN RAISE EXCEPTION 'invalid_share_command' USING ERRCODE='22023'; END IF;
 IF (action IN('open','rotate','close') AND (p_command-ARRAY['action','labelId','expectedRevision']<>'{}'::jsonb OR NOT p_command ?& ARRAY['labelId','expectedRevision']))
  OR (action='accept' AND (p_command-ARRAY['action','code']<>'{}'::jsonb OR NOT p_command ? 'code'))
  OR (action='unsubscribe' AND (p_command-ARRAY['action','labelId']<>'{}'::jsonb OR NOT p_command ? 'labelId')) THEN
  RAISE EXCEPTION 'invalid_share_command' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('label-share-command:'||principal||':'||p_operation_id,0));
 SELECT * INTO receipt FROM private.label_share_command_receipts WHERE user_id=principal AND operation_id=p_operation_id;
 IF FOUND THEN
  IF receipt.request IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'share_operation_conflict' USING ERRCODE='22023'; END IF;
  RETURN receipt.response;
 END IF;
 IF p_reconcile_only THEN RETURN jsonb_build_object('operationId',p_operation_id,'status','unknown'); END IF;
 BEGIN
 response:=CASE action
  WHEN 'accept' THEN public.accept_label_share_v1(p_command->>'code')
  WHEN 'unsubscribe' THEN public.unsubscribe_label_share_v1((p_command->>'labelId')::uuid)
  ELSE public.mutate_label_share_v1((p_command->>'labelId')::uuid,action,(p_command->>'expectedRevision')::integer) END;
 response:=jsonb_build_object('operationId',p_operation_id,'status','committed','action',action,'result',response);
 EXCEPTION WHEN serialization_failure OR insufficient_privilege OR invalid_parameter_value THEN
  IF SQLERRM NOT IN('share_revision_conflict','share_copy_required','share_unavailable') THEN RAISE; END IF;
  response:=jsonb_build_object('operationId',p_operation_id,'status','rejected','action',action,'reason',SQLERRM);
 END;
 INSERT INTO private.label_share_command_receipts VALUES(principal,p_operation_id,p_command,response);
 RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.command_label_share_v1(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.command_label_share_v1(uuid,jsonb,boolean) TO authenticated;
COMMIT;
