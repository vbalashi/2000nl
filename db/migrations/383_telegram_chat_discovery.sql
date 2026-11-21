BEGIN;

CREATE TABLE private.telegram_notification_targets (
 bot_id uuid NOT NULL REFERENCES private.operator_notification_bots(id) ON DELETE CASCADE,
 chat_id text NOT NULL CHECK (chat_id ~ '^-?[1-9][0-9]{0,19}$'),
 topic_id bigint NOT NULL DEFAULT 0 CHECK (topic_id BETWEEN 0 AND 9007199254740991),
 secret_version text NOT NULL,
 title text CHECK (char_length(title) BETWEEN 1 AND 128),
 is_forum boolean NOT NULL,
 available boolean NOT NULL DEFAULT true,
 event_at timestamptz NOT NULL,
 update_id bigint NOT NULL,
 PRIMARY KEY (bot_id, chat_id, topic_id)
);
CREATE TABLE private.telegram_notification_links (
 bot_id uuid PRIMARY KEY REFERENCES private.operator_notification_bots(id) ON DELETE CASCADE,
 code_hash bytea NOT NULL,
 secret_version text NOT NULL,
 operator_id uuid NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE private.telegram_notification_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.telegram_notification_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.telegram_notification_targets,private.telegram_notification_links FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_telegram_link_v1(p_operator uuid,p_request uuid,p_bot uuid,p_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE version text;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 SELECT secret_version INTO version FROM private.operator_notification_bots WHERE id=p_bot FOR SHARE;
 IF version IS NULL OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'bot_not_ready' USING ERRCODE='22023';
 END IF;
 INSERT INTO private.telegram_notification_links(bot_id,code_hash,secret_version,operator_id,expires_at)
 VALUES(p_bot,decode(p_hash,'hex'),version,p_operator,clock_timestamp()+interval '10 minutes')
 ON CONFLICT(bot_id) DO UPDATE SET code_hash=excluded.code_hash,secret_version=excluded.secret_version,operator_id=excluded.operator_id,expires_at=excluded.expires_at;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','telegram_link',p_bot::text,p_request);
 RETURN version;
END; $$;

CREATE FUNCTION public.admin_telegram_targets_v1(p_operator uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 RETURN coalesce((
 SELECT jsonb_agg(jsonb_build_object('botId',t.bot_id,'chatId',t.chat_id,'topicId',nullif(t.topic_id,0),
   'title',t.title,'isForum',t.is_forum) ORDER BY t.title,t.chat_id,t.topic_id)
 FROM private.telegram_notification_targets t
 JOIN private.telegram_notification_targets chat ON chat.bot_id=t.bot_id AND chat.chat_id=t.chat_id AND chat.topic_id=0
 JOIN private.operator_notification_bots b ON b.id=t.bot_id
 WHERE t.available AND chat.available AND b.secret_version=t.secret_version AND b.secret_version=chat.secret_version
 ),'[]'::jsonb);
END; $$;

CREATE FUNCTION public.admin_telegram_topic_credential_v1(p_operator uuid,p_request uuid,p_bot uuid,p_chat text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE version text;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 SELECT b.secret_version INTO version
 FROM private.operator_notification_bots b JOIN private.telegram_notification_targets t
 ON t.bot_id=b.id AND t.secret_version=b.secret_version
 WHERE b.id=p_bot AND t.chat_id=p_chat AND t.topic_id=0 AND t.is_forum AND t.available;
 IF version IS NULL THEN RAISE EXCEPTION 'forum_not_connected' USING ERRCODE='22023'; END IF;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','telegram_topic_request',p_bot::text,p_request);
 RETURN version;
END; $$;

CREATE FUNCTION public.operator_telegram_target_event_v1(
 p_bot uuid,p_version text,p_chat text,p_chat_title text,p_forum boolean,p_topic bigint,p_title text,
 p_action text,p_at timestamptz,p_update bigint,p_hash text DEFAULT NULL,p_operator uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE linked_by uuid;
BEGIN
 PERFORM 1 FROM private.operator_notification_bots WHERE id=p_bot AND secret_version=p_version FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_action='link' THEN
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  DELETE FROM private.telegram_notification_links l WHERE l.bot_id=p_bot AND l.secret_version=p_version AND l.code_hash=decode(p_hash,'hex')
   AND l.expires_at>clock_timestamp()
   AND EXISTS(SELECT 1 FROM public.admin_operators a WHERE a.user_id=l.operator_id AND a.is_active
     AND 'notifications.manage'=ANY(a.permissions))
   RETURNING l.operator_id INTO linked_by;
  IF linked_by IS NULL THEN RETURN false; END IF;
 ELSIF p_action='joined' THEN
  IF NOT EXISTS(SELECT 1 FROM public.admin_operators WHERE user_id=p_operator AND is_active
     AND 'notifications.manage'=ANY(permissions)) AND NOT EXISTS(
       SELECT 1 FROM private.telegram_notification_targets WHERE bot_id=p_bot AND chat_id=p_chat AND topic_id=0
         AND secret_version=p_version) THEN RETURN false; END IF;
 ELSIF p_action IN ('left','topic','closed','reopened','renamed') THEN
  IF NOT EXISTS(SELECT 1 FROM private.telegram_notification_targets WHERE bot_id=p_bot AND chat_id=p_chat AND topic_id=0
   AND secret_version=p_version) THEN RETURN false; END IF;
 ELSIF p_action='created' THEN
  PERFORM private.require_notification_manager_v1(p_operator);
  IF NOT EXISTS(SELECT 1 FROM private.telegram_notification_targets WHERE bot_id=p_bot AND chat_id=p_chat AND topic_id=0
   AND secret_version=p_version AND available AND is_forum) THEN RETURN false; END IF;
 ELSE
  RETURN false;
 END IF;

 IF p_action<>'created' THEN
  INSERT INTO private.telegram_notification_targets AS target(bot_id,chat_id,secret_version,title,is_forum,available,event_at,update_id)
  VALUES(p_bot,p_chat,p_version,p_chat_title,p_forum,p_action<>'left',p_at,p_update)
  ON CONFLICT(bot_id,chat_id,topic_id) DO UPDATE SET secret_version=excluded.secret_version,
   title=coalesce(excluded.title,target.title),is_forum=excluded.is_forum,
   available=CASE WHEN p_action IN ('left','joined','link') THEN excluded.available ELSE target.available END,
   event_at=excluded.event_at,update_id=excluded.update_id
  WHERE target.secret_version<>excluded.secret_version OR
    (target.event_at,target.update_id)<(excluded.event_at,excluded.update_id);
 END IF;

 IF p_topic IS NOT NULL THEN
  INSERT INTO private.telegram_notification_targets AS target(bot_id,chat_id,topic_id,secret_version,title,is_forum,available,event_at,update_id)
  VALUES(p_bot,p_chat,p_topic,p_version,p_title,true,p_action<>'closed',
   CASE WHEN p_action='created' THEN '-infinity'::timestamptz ELSE p_at END,p_update)
  ON CONFLICT(bot_id,chat_id,topic_id) DO UPDATE SET secret_version=excluded.secret_version,
   title=coalesce(excluded.title,target.title),
   available=CASE WHEN p_action IN ('renamed','created') AND target.secret_version=excluded.secret_version
    THEN target.available ELSE excluded.available END,
   event_at=CASE WHEN p_action='created' AND target.secret_version=excluded.secret_version THEN target.event_at ELSE excluded.event_at END,
   update_id=CASE WHEN p_action='created' AND target.secret_version=excluded.secret_version THEN target.update_id ELSE excluded.update_id END
  WHERE target.secret_version<>excluded.secret_version OR
    (p_action='created' AND target.title IS NULL) OR
    (p_action<>'created' AND (target.event_at,target.update_id)<(excluded.event_at,excluded.update_id));
 END IF;

 IF linked_by IS NOT NULL THEN
  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES(linked_by,'notifications.configuration.updated','success','telegram_chat_link',p_bot::text,gen_random_uuid());
 END IF;
 RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.admin_telegram_link_v1(uuid,uuid,uuid,text),
 public.admin_telegram_targets_v1(uuid),public.admin_telegram_topic_credential_v1(uuid,uuid,uuid,text),
 public.operator_telegram_target_event_v1(uuid,text,text,text,boolean,bigint,text,text,timestamptz,bigint,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_telegram_link_v1(uuid,uuid,uuid,text),
 public.admin_telegram_targets_v1(uuid),public.admin_telegram_topic_credential_v1(uuid,uuid,uuid,text),
 public.operator_telegram_target_event_v1(uuid,text,text,text,boolean,bigint,text,text,timestamptz,bigint,text,uuid)
 TO service_role;

COMMIT;
