BEGIN;

CREATE OR REPLACE FUNCTION public.admin_notification_authorize_route_test_v1(
  p_operator uuid, p_request uuid, p_route uuid, p_revision integer, p_kind text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  bot private.operator_notification_bots%ROWTYPE;
  route private.operator_notification_routes%ROWTYPE;
BEGIN
  PERFORM private.require_notification_manager_v1(p_operator);

  -- Lock the bot first, in the same order as credential rotation and archival.
  SELECT b.* INTO bot FROM private.operator_notification_bots b
  JOIN private.operator_notification_routes r ON r.bot_id=b.id
  WHERE r.id=p_route
  FOR UPDATE OF b;

  SELECT r.* INTO route FROM private.operator_notification_routes r
  WHERE r.id=p_route AND r.bot_id=bot.id AND r.revision=p_revision AND r.kind=p_kind
  FOR SHARE;
  IF NOT FOUND THEN
    -- PostgREST retries serialization failures. A stale route is a terminal conflict.
    RAISE EXCEPTION 'test_route_changed' USING ERRCODE='PT409';
  END IF;
  IF bot.archived_at IS NOT NULL OR bot.credential_state <> 'ready' OR bot.secret_version IS NULL THEN
    RAISE EXCEPTION 'bot_not_ready' USING ERRCODE='22023';
  END IF;
  IF bot.last_test_at > clock_timestamp() - interval '10 seconds' THEN
    RAISE EXCEPTION 'test_rate_limit' USING ERRCODE='P0001';
  END IF;

  UPDATE private.operator_notification_bots SET last_test_at=clock_timestamp() WHERE id=bot.id;
  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES(p_operator,'notifications.configuration.updated','success','notification_route_test_request',route.id::text,p_request);

  RETURN jsonb_build_object('botId',bot.id,'version',bot.secret_version,'chatId',route.chat_id,'topicId',route.topic_id);
END;
$$;

COMMIT;
