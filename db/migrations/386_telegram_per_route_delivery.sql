BEGIN;

-- Carry forward the effective Telegram state. A route that was globally muted
-- must stay off until an operator explicitly enables that route.
UPDATE private.operator_notification_routes SET enabled=false,revision=revision+1,updated_at=clock_timestamp()
WHERE enabled AND NOT (SELECT enabled FROM private.operator_notification_settings WHERE singleton);

UPDATE private.operator_notification_deliveries d
SET state='cancelled',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
WHERE d.transport='telegram' AND d.state IN ('pending','leased')
 AND NOT (SELECT enabled FROM private.operator_notification_settings WHERE singleton);

CREATE FUNCTION private.cancel_disabled_telegram_route() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE private.operator_notification_deliveries
 SET state='cancelled',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE route_id=NEW.id AND transport='telegram' AND state='pending';
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.cancel_disabled_telegram_route() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancel_disabled_telegram_route AFTER UPDATE OF enabled ON private.operator_notification_routes
FOR EACH ROW WHEN (OLD.enabled AND NOT NEW.enabled) EXECUTE FUNCTION private.cancel_disabled_telegram_route();

-- The existing global setting now gates approval mail only.
CREATE OR REPLACE FUNCTION private.enqueue_operator_admission_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.status='pending'
  AND ((SELECT enabled FROM private.operator_notification_settings WHERE singleton)
   OR EXISTS(SELECT 1 FROM private.operator_notification_routes r JOIN private.operator_notification_bots b ON b.id=r.bot_id
    WHERE r.kind='admission-request' AND r.enabled AND b.credential_state='ready')) THEN
  INSERT INTO private.operator_notification_events(kind,admission_email) VALUES('admission-request',NEW.email);
 ELSIF TG_OP='UPDATE' AND OLD.status<>'approved' AND NEW.status='approved' AND NEW.decided_by IS NOT NULL AND (SELECT enabled FROM private.operator_notification_settings WHERE singleton)
   AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=NEW.user_id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=NEW.email) THEN
  INSERT INTO private.operator_notification_events(kind,admission_email) VALUES('admission-approved',NEW.email);
 END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION private.enqueue_operator_feedback_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_routes r JOIN private.operator_notification_bots b ON b.id=r.bot_id WHERE r.kind='feedback' AND r.enabled AND b.credential_state='ready') THEN RETURN NEW; END IF;
 INSERT INTO private.operator_notification_events(kind,feedback_id) VALUES('feedback',NEW.id);
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.operator_enqueue_deployment_v1(p_stage text,p_run text,p_values jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_stage IS NULL OR p_stage NOT IN ('staging','production') OR p_run IS NULL
  OR p_run !~ '^[1-9][0-9]{0,18}:[1-9][0-9]{0,8}$' OR p_values IS NULL
  OR jsonb_typeof(p_values)<>'object' OR octet_length(p_values::text)>2048 THEN
  RAISE EXCEPTION 'invalid_deployment' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_routes r
  JOIN private.operator_notification_bots b ON b.id=r.bot_id
  WHERE r.kind='deployment' AND r.enabled AND b.credential_state='ready') THEN RETURN 'no-route'; END IF;
 INSERT INTO private.operator_notification_events(kind,deployment_stage,deployment_run,deployment_values)
 VALUES('deployment',p_stage,p_run,p_values)
 ON CONFLICT(deployment_stage,deployment_run) WHERE kind='deployment' DO NOTHING;
 RETURN 'queued';
END; $$;

CREATE OR REPLACE FUNCTION public.operator_delivery_claim_v1(p_limit integer DEFAULT 1) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
 UPDATE private.operator_notification_deliveries SET state='failed',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE state='leased' AND lease_until<clock_timestamp() AND attempts>=10
  AND (transport='telegram' OR (SELECT enabled FROM private.operator_notification_settings WHERE singleton));
 UPDATE private.operator_notification_deliveries d SET state='cancelled',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE (d.state='pending' OR (d.state='leased' AND d.lease_until<clock_timestamp())) AND d.transport='telegram'
 AND NOT EXISTS(SELECT 1 FROM private.operator_notification_routes r JOIN private.operator_notification_bots b ON b.id=d.bot_id
  WHERE r.id=d.route_id AND r.enabled AND r.bot_id=d.bot_id AND b.credential_state='ready' AND b.secret_version=d.secret_version);
 RETURN QUERY WITH candidates AS (
  SELECT d.id FROM private.operator_notification_deliveries d
  WHERE ((d.state='pending' AND d.next_attempt_at<=clock_timestamp()) OR (d.state='leased' AND d.lease_until<clock_timestamp()))
   AND (d.transport='telegram' OR (SELECT enabled FROM private.operator_notification_settings WHERE singleton))
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

CREATE OR REPLACE FUNCTION public.operator_delivery_decide_v1(p_delivery uuid,p_bot uuid,p_version text,p_chat text,p_topic bigint,p_operator uuid,p_action text,p_request uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event uuid;
BEGIN
 -- The callback identity includes this delivery and its exact key version.
 SELECT d.event_id INTO event FROM private.operator_notification_deliveries d
 JOIN private.operator_notification_routes r ON r.id=d.route_id
 JOIN private.operator_notification_bots b ON b.id=d.bot_id
 JOIN private.operator_notification_events e ON e.id=d.event_id
 WHERE d.id=p_delivery AND d.bot_id=p_bot AND d.secret_version=p_version AND d.chat_id=p_chat AND d.topic_id IS NOT DISTINCT FROM p_topic
  AND d.transport='telegram' AND d.state IN ('sent','leased') AND r.enabled AND r.bot_id=p_bot
  AND b.credential_state='ready' AND b.secret_version=d.secret_version AND e.kind='admission-request'
 FOR SHARE OF b,r,d;
 IF event IS NULL THEN RETURN 'expired'; END IF;
 RETURN private.operator_notification_decide_v1(event,p_operator,p_action,p_request);
END; $$;

COMMIT;
