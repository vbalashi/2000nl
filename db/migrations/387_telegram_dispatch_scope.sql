BEGIN;

-- Keep expiry and leasing in one implementation for both dispatch modes.
CREATE FUNCTION private.operator_claim_notification_deliveries(p_limit integer,p_telegram_only boolean) RETURNS SETOF jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
 UPDATE private.operator_notification_deliveries SET state='failed',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE (NOT p_telegram_only OR transport='telegram')
  AND state='leased' AND lease_until<clock_timestamp() AND attempts>=10
  AND (transport='telegram' OR (SELECT enabled FROM private.operator_notification_settings WHERE singleton));
 UPDATE private.operator_notification_deliveries d SET state='cancelled',lease_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE (d.state='pending' OR (d.state='leased' AND d.lease_until<clock_timestamp())) AND d.transport='telegram'
 AND NOT EXISTS(SELECT 1 FROM private.operator_notification_routes r JOIN private.operator_notification_bots b ON b.id=d.bot_id
  WHERE r.id=d.route_id AND r.enabled AND r.bot_id=d.bot_id AND b.credential_state='ready' AND b.secret_version=d.secret_version);
 RETURN QUERY WITH candidates AS (
  SELECT d.id FROM private.operator_notification_deliveries d
  WHERE (NOT p_telegram_only OR d.transport='telegram')
   AND ((d.state='pending' AND d.next_attempt_at<=clock_timestamp()) OR (d.state='leased' AND d.lease_until<clock_timestamp()))
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

REVOKE ALL ON FUNCTION private.operator_claim_notification_deliveries(integer,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.operator_delivery_claim_v1(p_limit integer DEFAULT 1) RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT * FROM private.operator_claim_notification_deliveries(p_limit,false);
$$;

CREATE FUNCTION public.operator_telegram_delivery_claim_v1(p_limit integer DEFAULT 1) RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT * FROM private.operator_claim_notification_deliveries(p_limit,true);
$$;

CREATE FUNCTION public.operator_telegram_notification_status_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('pending',count(*) FILTER(WHERE state='pending'),
  'leased',count(*) FILTER(WHERE state='leased'), 'failed',count(*) FILTER(WHERE state='failed'),
  'oldestPendingAt',min(created_at) FILTER(WHERE state IN ('pending','leased')))
 FROM private.operator_notification_deliveries WHERE transport='telegram';
$$;

CREATE FUNCTION public.operator_telegram_notification_cleanup_v1() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer; parents integer;
BEGIN
 WITH expired AS (
  SELECT id FROM private.operator_notification_deliveries WHERE transport='telegram' AND (
   (state IN ('sent','cancelled') AND finished_at<clock_timestamp()-interval '30 days')
   OR (state='failed' AND finished_at<clock_timestamp()-interval '90 days'))
  ORDER BY finished_at,id FOR UPDATE SKIP LOCKED LIMIT 500
 ) DELETE FROM private.operator_notification_deliveries d USING expired e WHERE d.id=e.id;
 GET DIAGNOSTICS removed=ROW_COUNT;
 WITH expired AS (
  SELECT e.id FROM private.operator_notification_events e
  WHERE e.kind IN ('admission-request','feedback','deployment') AND e.created_at<clock_timestamp()-interval '30 days'
   AND NOT EXISTS(SELECT 1 FROM private.operator_notification_deliveries d WHERE d.event_id=e.id)
  ORDER BY e.created_at,e.id FOR UPDATE SKIP LOCKED LIMIT 500
 ) DELETE FROM private.operator_notification_events e USING expired x WHERE e.id=x.id;
 GET DIAGNOSTICS parents=ROW_COUNT;
 RETURN removed+parents;
END; $$;

REVOKE ALL ON FUNCTION public.operator_telegram_delivery_claim_v1(integer),
 public.operator_telegram_notification_status_v1(),public.operator_telegram_notification_cleanup_v1()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operator_telegram_delivery_claim_v1(integer),
 public.operator_telegram_notification_status_v1(),public.operator_telegram_notification_cleanup_v1()
 TO service_role;

COMMIT;
