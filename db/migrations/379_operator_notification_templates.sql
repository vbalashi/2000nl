BEGIN;

CREATE TABLE private.operator_notification_template_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('feedback','admission-request')),
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
 UNIQUE (kind, id)
);
ALTER TABLE private.operator_notification_template_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operator_notification_template_versions FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE private.operator_notification_deliveries ADD COLUMN template_version bigint
 REFERENCES private.operator_notification_template_versions(id);
ALTER TABLE private.operator_notification_bots ADD COLUMN last_test_at timestamptz;

CREATE FUNCTION private.pin_operator_notification_template_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.transport='telegram' THEN
  SELECT t.id INTO NEW.template_version
  FROM private.operator_notification_events e
  JOIN private.operator_notification_template_versions t ON t.kind=e.kind
  WHERE e.id=NEW.event_id ORDER BY t.id DESC LIMIT 1;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.pin_operator_notification_template_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pin_operator_notification_template BEFORE INSERT ON private.operator_notification_deliveries
 FOR EACH ROW EXECUTE FUNCTION private.pin_operator_notification_template_v1();

CREATE FUNCTION public.admin_notification_templates_v1(p_operator uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.read','success','notification_templates','all',p_request);
 RETURN coalesce((SELECT jsonb_object_agg(kind,jsonb_build_object('revision',id::text,'body',body))
  FROM (SELECT DISTINCT ON (kind) kind,id,body FROM private.operator_notification_template_versions ORDER BY kind,id DESC) latest),'{}'::jsonb);
END; $$;

CREATE FUNCTION public.admin_notification_publish_template_v1(p_operator uuid,p_request uuid,p_kind text,p_body text,p_revision bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_revision bigint;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_kind IS NULL OR p_kind NOT IN ('feedback','admission-request') OR p_body IS NULL
  OR char_length(p_body) NOT BETWEEN 1 AND 2000 OR p_revision IS NULL THEN
  RAISE EXCEPTION 'invalid_template' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(379, CASE WHEN p_kind='feedback' THEN 1 ELSE 2 END);
 SELECT max(id) INTO current_revision FROM private.operator_notification_template_versions WHERE kind=p_kind;
 IF coalesce(current_revision,0)<>p_revision THEN
  RAISE EXCEPTION 'revision_conflict' USING ERRCODE='40001';
 END IF;
 INSERT INTO private.operator_notification_template_versions(kind,body) VALUES(p_kind,p_body) RETURNING id INTO current_revision;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_template',p_kind,p_request);
 RETURN current_revision::text;
END; $$;

CREATE FUNCTION public.admin_notification_authorize_test_v1(p_operator uuid,p_request uuid,p_bot uuid,p_chat text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE version text; tested_at timestamptz;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_chat IS NULL OR p_chat !~ '^-?[1-9][0-9]{0,19}$' THEN
  RAISE EXCEPTION 'invalid_test_chat' USING ERRCODE='22023';
 END IF;
 SELECT secret_version,last_test_at INTO version,tested_at FROM private.operator_notification_bots
 WHERE id=p_bot AND credential_state='ready' FOR UPDATE;
 IF version IS NULL THEN RAISE EXCEPTION 'bot_not_ready' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM private.operator_notification_routes WHERE chat_id=p_chat) THEN
  RAISE EXCEPTION 'chat_is_routed' USING ERRCODE='22023';
 END IF;
 IF tested_at>clock_timestamp()-interval '10 seconds' THEN
  RAISE EXCEPTION 'test_rate_limit' USING ERRCODE='P0001';
 END IF;
 UPDATE private.operator_notification_bots SET last_test_at=clock_timestamp() WHERE id=p_bot;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_test_request',p_bot::text,p_request);
 RETURN version;
END; $$;

REVOKE ALL ON FUNCTION public.admin_notification_templates_v1(uuid,uuid),
 public.admin_notification_publish_template_v1(uuid,uuid,text,text,bigint),
 public.admin_notification_authorize_test_v1(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notification_templates_v1(uuid,uuid),
 public.admin_notification_publish_template_v1(uuid,uuid,text,text,bigint),
 public.admin_notification_authorize_test_v1(uuid,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.operator_delivery_claim_v1(p_limit integer DEFAULT 1) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_settings WHERE singleton AND enabled) THEN RETURN; END IF;
 UPDATE private.operator_notification_deliveries SET state='failed',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE state='leased' AND lease_until<clock_timestamp() AND attempts>=10;
 UPDATE private.operator_notification_deliveries d SET state='cancelled',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE (d.state='pending' OR (d.state='leased' AND d.lease_until<clock_timestamp())) AND d.transport='telegram'
 AND NOT EXISTS(SELECT 1 FROM private.operator_notification_routes r JOIN private.operator_notification_bots b ON b.id=d.bot_id
  WHERE r.id=d.route_id AND r.enabled AND r.bot_id=d.bot_id AND b.credential_state='ready' AND b.secret_version=d.secret_version);
 RETURN QUERY WITH candidates AS (
  SELECT d.id FROM private.operator_notification_deliveries d
  WHERE (d.state='pending' AND d.next_attempt_at<=clock_timestamp()) OR (d.state='leased' AND d.lease_until<clock_timestamp())
  ORDER BY d.next_attempt_at,d.id FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), claimed AS (
  UPDATE private.operator_notification_deliveries d SET state='leased',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=d.attempts+1
  FROM candidates c WHERE c.id=d.id RETURNING d.*
 ) SELECT jsonb_build_object('id',d.id,'eventId',e.id,'kind',e.kind,'transport',d.transport,'leaseId',d.lease_id,'attempts',d.attempts,
  'botId',d.bot_id,'secretVersion',d.secret_version,'chatId',d.chat_id,'topicId',d.topic_id,'templateBody',t.body,'email',e.admission_email,'feedbackId',e.feedback_id,
  'admissionStatus',a.status,'emailVerified',coalesce(u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=e.admission_email,false))
 FROM claimed d JOIN private.operator_notification_events e ON e.id=d.event_id
 LEFT JOIN private.operator_notification_template_versions t ON t.id=d.template_version
 LEFT JOIN private.admission_requests a ON a.email=e.admission_email LEFT JOIN auth.users u ON u.id=a.user_id;
END; $$;

COMMIT;
