BEGIN;
ALTER TABLE private.operator_notification_bots ADD COLUMN archived_at timestamptz;

CREATE FUNCTION private.prevent_archived_notification_bot_update() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.archived_at IS NOT NULL THEN RAISE EXCEPTION 'bot_archived' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER prevent_archived_notification_bot_update BEFORE UPDATE ON private.operator_notification_bots
FOR EACH ROW EXECUTE FUNCTION private.prevent_archived_notification_bot_update();

CREATE FUNCTION public.admin_archive_notification_bot_v1(p_operator uuid,p_request uuid,p_bot uuid,p_revision integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 UPDATE private.operator_notification_bots SET archived_at=clock_timestamp(),credential_state='missing',
  secret_version=NULL,credential_operation=NULL,revision=revision+1,updated_at=clock_timestamp()
 WHERE id=p_bot AND revision=p_revision AND archived_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE private.operator_notification_routes SET enabled=false,revision=revision+1,updated_at=clock_timestamp()
 WHERE bot_id=p_bot AND enabled;
 DELETE FROM private.telegram_notification_links WHERE bot_id=p_bot;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_bot_archive',p_bot::text,p_request);
 RETURN true;
END; $$;

CREATE FUNCTION public.admin_notification_configuration_v3(p_operator uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE settings jsonb; key text; projection jsonb;
BEGIN
 settings:=public.admin_notification_configuration_v2(p_operator,p_request);
 FOREACH key IN ARRAY ARRAY['bots','routes','testDestinations','deliveryStatus'] LOOP
  SELECT coalesce(jsonb_agg(value ORDER BY position),'[]'::jsonb) INTO projection
  FROM jsonb_array_elements(settings->key) WITH ORDINALITY AS rows(value,position)
  WHERE NOT EXISTS (
   SELECT 1 FROM private.operator_notification_bots b
   WHERE b.archived_at IS NOT NULL AND b.id=CASE
    WHEN key='bots' THEN (value->>'id')::uuid
    WHEN key='deliveryStatus' THEN (SELECT r.bot_id FROM private.operator_notification_routes r WHERE r.id=(value->>'routeId')::uuid)
    ELSE (value->>'botId')::uuid END);
  settings:=jsonb_set(settings,ARRAY[key],projection);
 END LOOP;
 RETURN settings;
END; $$;

REVOKE ALL ON FUNCTION public.admin_archive_notification_bot_v1(uuid,uuid,uuid,integer),
 public.admin_notification_configuration_v3(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_notification_bot_v1(uuid,uuid,uuid,integer),
 public.admin_notification_configuration_v3(uuid,uuid) TO service_role;
COMMIT;
