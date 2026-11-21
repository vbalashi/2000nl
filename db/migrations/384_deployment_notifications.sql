BEGIN;

ALTER TABLE private.operator_notification_routes DROP CONSTRAINT operator_notification_routes_kind_check,
 ADD CHECK (kind IN ('admission-request','feedback','deployment'));
ALTER TABLE private.operator_notification_template_versions DROP CONSTRAINT operator_notification_template_versions_kind_check,
 ADD CHECK (kind IN ('feedback','admission-request','deployment-staging','deployment-production'));

-- This anonymous check was created by migration 373. The named kind check remains
-- separate, so invalid event kinds still fail even with a populated release payload.
ALTER TABLE private.operator_notification_events
 DROP CONSTRAINT operator_notification_events_check,
 DROP CONSTRAINT operator_notification_events_kind_check,
 ADD COLUMN deployment_stage text CHECK (deployment_stage IN ('staging','production')),
 ADD COLUMN deployment_run text,
 ADD COLUMN deployment_values jsonb,
 ADD CHECK (kind IN ('admission-request','admission-approved','feedback','deployment')),
 ADD CONSTRAINT operator_notification_event_payload CHECK (
  (kind='feedback' AND feedback_id IS NOT NULL AND admission_email IS NULL
     AND deployment_stage IS NULL AND deployment_run IS NULL AND deployment_values IS NULL)
  OR (kind IN ('admission-request','admission-approved') AND admission_email IS NOT NULL AND feedback_id IS NULL
     AND deployment_stage IS NULL AND deployment_run IS NULL AND deployment_values IS NULL)
  OR (kind='deployment' AND feedback_id IS NULL AND admission_email IS NULL AND deployment_stage IS NOT NULL
     AND deployment_run IS NOT NULL AND deployment_values IS NOT NULL AND jsonb_typeof(deployment_values)='object')
 );
CREATE UNIQUE INDEX operator_notification_deployment_once
 ON private.operator_notification_events (deployment_stage,deployment_run) WHERE kind='deployment';

CREATE FUNCTION public.operator_enqueue_deployment_v1(p_stage text,p_run text,p_values jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_stage IS NULL OR p_stage NOT IN ('staging','production') OR p_run IS NULL
  OR p_run !~ '^[1-9][0-9]{0,18}:[1-9][0-9]{0,8}$' OR p_values IS NULL
  OR jsonb_typeof(p_values)<>'object' OR octet_length(p_values::text)>2048 THEN
  RAISE EXCEPTION 'invalid_deployment' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_settings WHERE singleton AND enabled) THEN RETURN 'disabled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_routes r
  JOIN private.operator_notification_bots b ON b.id=r.bot_id
  WHERE r.kind='deployment' AND r.enabled AND b.credential_state='ready') THEN RETURN 'no-route'; END IF;
 INSERT INTO private.operator_notification_events(kind,deployment_stage,deployment_run,deployment_values)
 VALUES('deployment',p_stage,p_run,p_values)
 ON CONFLICT(deployment_stage,deployment_run) WHERE kind='deployment' DO NOTHING;
 RETURN 'queued';
END; $$;
REVOKE ALL ON FUNCTION public.operator_enqueue_deployment_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.operator_enqueue_deployment_v1(text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_notification_save_route_v1(p_operator uuid,p_request uuid,p_id uuid,p_revision integer,p_bot uuid,p_kind text,p_chat text,p_topic bigint,p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE route private.operator_notification_routes;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_request IS NULL OR p_bot IS NULL OR p_kind IS NULL OR p_kind NOT IN ('admission-request','feedback','deployment')
  OR p_chat IS NULL OR p_chat !~ '^-?[1-9][0-9]{0,19}$'
  OR (p_topic IS NOT NULL AND p_topic NOT BETWEEN 1 AND 9007199254740991) OR p_enabled IS NULL THEN
  RAISE EXCEPTION 'invalid_route' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM private.operator_notification_bots WHERE id=p_bot FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'bot_not_found' USING ERRCODE='22023'; END IF;
 IF p_enabled AND NOT EXISTS(SELECT 1 FROM private.operator_notification_bots WHERE id=p_bot AND credential_state='ready') THEN
  RAISE EXCEPTION 'bot_credential_required' USING ERRCODE='22023'; END IF;
 IF p_id IS NULL THEN
  IF p_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='40001'; END IF;
  INSERT INTO private.operator_notification_routes(bot_id,kind,chat_id,topic_id,enabled)
   VALUES(p_bot,p_kind,p_chat,p_topic,p_enabled) RETURNING * INTO route;
 ELSE
  UPDATE private.operator_notification_routes SET bot_id=p_bot,kind=p_kind,chat_id=p_chat,topic_id=p_topic,
   enabled=p_enabled,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_id AND revision=p_revision RETURNING * INTO route;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='40001'; END IF;
 END IF;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_route',route.id::text,p_request);
 RETURN jsonb_build_object('id',route.id,'botId',route.bot_id,'kind',route.kind,'chatId',route.chat_id,'topicId',route.topic_id,'enabled',route.enabled,'revision',route.revision);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_notification_publish_template_v1(p_operator uuid,p_request uuid,p_kind text,p_body text,p_revision bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_revision bigint;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_kind IS NULL OR p_kind NOT IN ('feedback','admission-request','deployment-staging','deployment-production') OR p_body IS NULL
  OR char_length(p_body) NOT BETWEEN 1 AND 2000 OR p_revision IS NULL THEN
  RAISE EXCEPTION 'invalid_template' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(379, CASE p_kind WHEN 'feedback' THEN 1 WHEN 'admission-request' THEN 2 WHEN 'deployment-staging' THEN 3 ELSE 4 END);
 SELECT max(id) INTO current_revision FROM private.operator_notification_template_versions WHERE kind=p_kind;
 IF coalesce(current_revision,0)<>p_revision THEN
  RAISE EXCEPTION 'revision_conflict' USING ERRCODE='40001';
 END IF;
 INSERT INTO private.operator_notification_template_versions(kind,body) VALUES(p_kind,p_body) RETURNING id INTO current_revision;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_template',p_kind,p_request);
 RETURN current_revision::text;
END; $$;

CREATE OR REPLACE FUNCTION private.pin_operator_notification_template_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.transport='telegram' THEN
  SELECT t.id INTO NEW.template_version
  FROM private.operator_notification_events e
  JOIN private.operator_notification_template_versions t ON t.kind=CASE WHEN e.kind='deployment' THEN 'deployment-'||e.deployment_stage ELSE e.kind END
  WHERE e.id=NEW.event_id ORDER BY t.id DESC LIMIT 1;
 END IF;
 RETURN NEW;
END; $$;

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
  'botId',d.bot_id,'secretVersion',d.secret_version,'chatId',d.chat_id,'topicId',d.topic_id,'templateBody',t.body,'deploymentStage',e.deployment_stage,'deploymentValues',e.deployment_values,'email',e.admission_email,'feedbackId',e.feedback_id,
  'admissionStatus',a.status,'emailVerified',coalesce(u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=e.admission_email,false))
 FROM claimed d JOIN private.operator_notification_events e ON e.id=d.event_id
 LEFT JOIN private.operator_notification_template_versions t ON t.id=d.template_version
 LEFT JOIN private.admission_requests a ON a.email=e.admission_email LEFT JOIN auth.users u ON u.id=a.user_id;
END; $$;

COMMIT;
