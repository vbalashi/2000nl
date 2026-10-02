-- Read only: owner-scoped completion summary; independent of FSRS and queues.
BEGIN;
CREATE INDEX training_active_time_user_session_idx
 ON private.training_active_time_v1(user_id,session_id) INCLUDE(active_ms);
CREATE FUNCTION public.get_training_session_active_time_v1(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid := (select auth.uid()); total bigint; receipts bigint;
BEGIN
 IF principal IS NULL THEN RETURN jsonb_build_object('error','unauthorized'); END IF;
 IF p_session_id IS NULL THEN RETURN jsonb_build_object('error','invalid_session'); END IF;
 -- Receipts retain owner identity if the expiring session read model is removed.
 SELECT sum(active_ms),count(*) INTO total,receipts
 FROM private.training_active_time_v1 WHERE user_id=principal AND session_id=p_session_id;
 IF receipts=0 AND NOT EXISTS(SELECT 1 FROM public.training_sessions WHERE id=p_session_id AND user_id=principal) THEN
  RETURN jsonb_build_object('error','session_not_owned');
 END IF;
 RETURN jsonb_build_object('sessionId',p_session_id,'activeMilliseconds',total,'measurementCount',receipts);
END $$;
REVOKE ALL ON FUNCTION public.get_training_session_active_time_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_training_session_active_time_v1(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
