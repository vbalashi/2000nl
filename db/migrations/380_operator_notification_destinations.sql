BEGIN;

ALTER TABLE private.operator_notification_routes
 ADD COLUMN chat_title text CHECK (char_length(chat_title) BETWEEN 1 AND 120),
 ADD COLUMN topic_title text CHECK (topic_title IS NULL OR (topic_id IS NOT NULL AND char_length(topic_title) BETWEEN 1 AND 120));

CREATE FUNCTION private.reset_operator_notification_route_titles_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.chat_id IS DISTINCT FROM OLD.chat_id THEN NEW.chat_title:=NULL; END IF;
 IF NEW.chat_id IS DISTINCT FROM OLD.chat_id OR NEW.topic_id IS DISTINCT FROM OLD.topic_id THEN NEW.topic_title:=NULL; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.reset_operator_notification_route_titles_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER reset_operator_notification_route_titles
 BEFORE UPDATE OF chat_id,topic_id ON private.operator_notification_routes
 FOR EACH ROW EXECUTE FUNCTION private.reset_operator_notification_route_titles_v1();

CREATE TABLE private.operator_notification_test_destinations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bot_id uuid NOT NULL REFERENCES private.operator_notification_bots(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
 chat_id text NOT NULL CHECK (chat_id ~ '^-?[1-9][0-9]{0,19}$'),
 topic_id bigint CHECK (topic_id BETWEEN 1 AND 9007199254740991),
 UNIQUE NULLS NOT DISTINCT (bot_id, chat_id, topic_id)
);
ALTER TABLE private.operator_notification_test_destinations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operator_notification_test_destinations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_notification_configuration_v2(p_operator uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE settings jsonb;
BEGIN
 settings:=public.admin_notification_configuration_v1(p_operator,p_request);
 RETURN settings || jsonb_build_object(
  'routes',coalesce((SELECT jsonb_agg(entry || jsonb_build_object('chatTitle',r.chat_title,'topicTitle',r.topic_title) ORDER BY position)
    FROM jsonb_array_elements(settings->'routes') WITH ORDINALITY AS items(entry,position)
    JOIN private.operator_notification_routes r ON r.id=(entry->>'id')::uuid),'[]'::jsonb),
  'testDestinations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'botId',bot_id,'title',title,'chatId',chat_id,'topicId',topic_id) ORDER BY title,id)
    FROM private.operator_notification_test_destinations d
    WHERE NOT EXISTS (SELECT 1 FROM private.operator_notification_routes r WHERE r.chat_id=d.chat_id)),'[]'::jsonb));
END; $$;

CREATE FUNCTION public.admin_notification_save_route_v2(p_operator uuid,p_request uuid,p_id uuid,p_revision integer,p_bot uuid,p_kind text,p_chat text,p_topic bigint,p_enabled boolean,p_chat_title text,p_topic_title text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 result:=public.admin_notification_save_route_v1(p_operator,p_request,p_id,p_revision,p_bot,p_kind,p_chat,p_topic,p_enabled);
 UPDATE private.operator_notification_routes
 SET chat_title=nullif(btrim(p_chat_title),''),topic_title=CASE WHEN p_topic IS NOT NULL THEN nullif(btrim(p_topic_title),'') END
 WHERE id=(result->>'id')::uuid;
 RETURN result;
END; $$;

CREATE FUNCTION public.admin_notification_save_test_destination_v1(p_operator uuid,p_request uuid,p_bot uuid,p_title text,p_chat text,p_topic bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE destination_id uuid;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_bots WHERE id=p_bot AND credential_state='ready') THEN
  RAISE EXCEPTION 'bot_not_ready' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM private.operator_notification_routes WHERE chat_id=p_chat) THEN
  RAISE EXCEPTION 'chat_is_routed' USING ERRCODE='22023';
 END IF;
 INSERT INTO private.operator_notification_test_destinations(bot_id,title,chat_id,topic_id)
 VALUES(p_bot,btrim(p_title),p_chat,p_topic)
 ON CONFLICT(bot_id,chat_id,topic_id) DO UPDATE SET title=excluded.title RETURNING id INTO destination_id;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_test_destination',destination_id::text,p_request);
 RETURN destination_id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_notification_configuration_v2(uuid,uuid),
 public.admin_notification_save_route_v2(uuid,uuid,uuid,integer,uuid,text,text,bigint,boolean,text,text),
 public.admin_notification_save_test_destination_v1(uuid,uuid,uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_configuration_v2(uuid,uuid),
 public.admin_notification_save_route_v2(uuid,uuid,uuid,integer,uuid,text,text,bigint,boolean,text,text),
 public.admin_notification_save_test_destination_v1(uuid,uuid,uuid,text,text,bigint) TO service_role;

COMMIT;
