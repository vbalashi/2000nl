BEGIN;

-- Notification administration extends existing capabilities.
ALTER TABLE public.admin_operators DROP CONSTRAINT admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators ADD CONSTRAINT admin_operators_permissions_allowed CHECK (permissions <@ ARRAY['dictionaries.read','audit.read','publication.manage','dictionary.content.read','users.read','admission.manage','feedback.read','editorial.edit','notifications.manage']::text[]);
ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_allowed;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_allowed CHECK (action = ANY (ARRAY['auth.sign_in','auth.sign_in_denied','auth.sign_out','access.denied','dictionary.registry.read','dictionary.metadata.read','dictionary.content.read','dictionary.publication.updated','dictionary.audience.updated','audit.journal.read','user.registry.read','user.profile.read','admission.approve','admission.reject','admission.revoke','admission.invite','admission.mode','admission.auto_approve','feedback.registry.read','feedback.detail.read','operator.permissions.updated','notifications.configuration.read','notifications.configuration.updated']::text[]));


CREATE TABLE private.operator_notification_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE private.operator_notification_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO private.operator_notification_settings(singleton) VALUES(true);
REVOKE ALL ON private.operator_notification_settings FROM PUBLIC,anon,authenticated,service_role;

-- Metadata only. Credentials live in the dedicated external secret store.
CREATE TABLE private.operator_notification_bots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 credential_state text NOT NULL DEFAULT 'missing' CHECK (credential_state IN ('missing','pending','ready','failed')),
 secret_version text CHECK (secret_version ~ '^[0-9a-f]{32}$'),
 credential_operation uuid,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((credential_state='ready') = (secret_version IS NOT NULL))
);
CREATE TABLE private.operator_notification_routes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bot_id uuid NOT NULL REFERENCES private.operator_notification_bots(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('admission-request','feedback')),
 chat_id text NOT NULL CHECK (chat_id ~ '^-?[1-9][0-9]{0,19}$'),
 topic_id bigint CHECK (topic_id BETWEEN 1 AND 9007199254740991),
 enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX operator_notification_routes_bot ON private.operator_notification_routes(bot_id);
ALTER TABLE private.operator_notification_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.operator_notification_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operator_notification_bots,private.operator_notification_routes FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.require_notification_manager_v1(p_operator uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.admin_operators WHERE user_id=p_operator AND is_active
  AND 'notifications.manage'=ANY(permissions) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'notification_manager_required' USING ERRCODE='42501'; END IF;
END; $$;

CREATE FUNCTION public.admin_notification_configuration_v1(p_operator uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_id_required' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object(
  'enabled',(SELECT enabled FROM private.operator_notification_settings WHERE singleton),
  'bots',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'credentialState',b.credential_state,'revision',b.revision) ORDER BY b.created_at,b.id) FROM private.operator_notification_bots b),'[]'::jsonb),
  'routes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'botId',r.bot_id,'kind',r.kind,'chatId',r.chat_id,'topicId',r.topic_id,'enabled',r.enabled,'revision',r.revision) ORDER BY r.created_at,r.id) FROM private.operator_notification_routes r),'[]'::jsonb),
  'deliveryStatus',coalesce((SELECT jsonb_agg(to_jsonb(summary)) FROM (SELECT route_id AS "routeId",state,count(*) AS count,min(created_at) AS "oldestAt" FROM private.operator_notification_deliveries GROUP BY route_id,state) summary),'[]'::jsonb)) INTO result;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.read','success','notification_configuration','all',p_request);
 RETURN result;
END; $$;

CREATE FUNCTION public.admin_notification_enabled_v1(p_operator uuid,p_request uuid,p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_request IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_setting' USING ERRCODE='22023'; END IF;
 UPDATE private.operator_notification_settings SET enabled=p_enabled WHERE singleton;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_setting',CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END,p_request);
 RETURN p_enabled;
END; $$;
REVOKE ALL ON FUNCTION public.admin_notification_enabled_v1(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_notification_enabled_v1(uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.admin_notification_create_bot_v1(p_operator uuid,p_request uuid,p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bot private.operator_notification_bots;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_request IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
  RAISE EXCEPTION 'invalid_bot' USING ERRCODE='22023'; END IF;
 INSERT INTO private.operator_notification_bots(name) VALUES(btrim(p_name)) RETURNING * INTO bot;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_bot',bot.id::text,p_request);
 RETURN jsonb_build_object('id',bot.id,'name',bot.name,'credentialState',bot.credential_state,'revision',bot.revision);
END; $$;
CREATE FUNCTION public.admin_notification_save_route_v1(p_operator uuid,p_request uuid,p_id uuid,p_revision integer,p_bot uuid,p_kind text,p_chat text,p_topic bigint,p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE route private.operator_notification_routes;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_request IS NULL OR p_bot IS NULL OR p_kind IS NULL OR p_kind NOT IN ('admission-request','feedback')
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
REVOKE ALL ON FUNCTION public.admin_notification_save_route_v1(uuid,uuid,uuid,integer,uuid,text,text,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_notification_save_route_v1(uuid,uuid,uuid,integer,uuid,text,text,bigint,boolean) TO service_role;

CREATE FUNCTION public.admin_notification_begin_secret_v1(p_operator uuid,p_request uuid,p_bot uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bot private.operator_notification_bots;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_request IS NULL THEN RAISE EXCEPTION 'request_id_required' USING ERRCODE='22023'; END IF;
 UPDATE private.operator_notification_bots SET credential_state='pending',secret_version=NULL,
  credential_operation=p_request,revision=revision+1,updated_at=clock_timestamp()
 WHERE id=p_bot AND revision=p_revision RETURNING * INTO bot;
 IF NOT FOUND THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='40001'; END IF;
 -- Rotation stops delivery until the new version is confirmed and routes are
 -- deliberately re-enabled. Never silently redirect already enabled routes.
 UPDATE private.operator_notification_routes SET enabled=false,revision=revision+1,updated_at=clock_timestamp()
 WHERE bot_id=p_bot AND enabled;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated','success','notification_secret_pending',p_bot::text,p_request);
 RETURN jsonb_build_object('operation',p_request,'revision',bot.revision);
END; $$;
CREATE FUNCTION public.admin_notification_finish_secret_v1(p_operator uuid,p_request uuid,p_bot uuid,p_operation uuid,p_version text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
 PERFORM private.require_notification_manager_v1(p_operator);
 IF p_request IS NULL OR p_operation IS NULL OR (p_version IS NOT NULL AND p_version !~ '^[0-9a-f]{32}$') THEN
  RAISE EXCEPTION 'invalid_secret_receipt' USING ERRCODE='22023'; END IF;
 UPDATE private.operator_notification_bots SET credential_state=CASE WHEN p_version IS NULL THEN 'failed' ELSE 'ready' END,
  secret_version=p_version,credential_operation=NULL,revision=revision+1,updated_at=clock_timestamp()
 WHERE id=p_bot AND credential_state='pending' AND credential_operation=p_operation;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected=0 THEN RETURN false; END IF;
 INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
 VALUES(p_operator,'notifications.configuration.updated',CASE WHEN p_version IS NULL THEN 'failure' ELSE 'success' END,'notification_secret_result',p_bot::text,p_request);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.admin_notification_begin_secret_v1(uuid,uuid,uuid,integer),public.admin_notification_finish_secret_v1(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_notification_begin_secret_v1(uuid,uuid,uuid,integer),public.admin_notification_finish_secret_v1(uuid,uuid,uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION private.require_notification_manager_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_notification_configuration_v1(uuid,uuid),public.admin_notification_create_bot_v1(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_notification_configuration_v1(uuid,uuid),public.admin_notification_create_bot_v1(uuid,uuid,text) TO service_role;

-- The queue stores references, not snapshots of email or report evidence.  Workers
-- are privileged server-side consumers; it is never exposed to browser roles.
CREATE TABLE private.operator_notification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('admission-request','admission-approved','feedback')),
 admission_email text REFERENCES private.admission_requests(email) ON DELETE CASCADE,
 feedback_id uuid REFERENCES public.feedback_items(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((kind='feedback' AND feedback_id IS NOT NULL AND admission_email IS NULL)
     OR (kind<>'feedback' AND admission_email IS NOT NULL AND feedback_id IS NULL))
);
CREATE INDEX operator_notification_event_retention ON private.operator_notification_events(created_at,id);
ALTER TABLE private.operator_notification_events ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX operator_notification_feedback_once ON private.operator_notification_events(feedback_id)
 WHERE kind='feedback';
REVOKE ALL ON private.operator_notification_events FROM PUBLIC,anon,authenticated,service_role;

-- Each accepted domain event fans out into independent transport deliveries.
-- Destination and credential version are frozen at enqueue time; route edits
-- affect only future events. A route can still be disabled to stop pending work.
CREATE TABLE private.operator_notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES private.operator_notification_events(id) ON DELETE CASCADE,
 route_id uuid REFERENCES private.operator_notification_routes(id) ON DELETE RESTRICT,
 bot_id uuid REFERENCES private.operator_notification_bots(id) ON DELETE RESTRICT,
 route_revision integer,
 secret_version text,
 chat_id text,
 topic_id bigint,
 transport text NOT NULL CHECK (transport IN ('telegram','email')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,
 lease_until timestamptz,
 finished_at timestamptz,
 CHECK ((state='leased')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK ((state IN ('sent','failed','cancelled'))=(finished_at IS NOT NULL)),
 CHECK ((transport='email' AND route_id IS NULL AND bot_id IS NULL AND secret_version IS NULL AND chat_id IS NULL)
  OR (transport='telegram' AND route_id IS NOT NULL AND bot_id IS NOT NULL AND route_revision IS NOT NULL AND secret_version IS NOT NULL AND chat_id IS NOT NULL))
);
CREATE INDEX operator_notification_delivery_event ON private.operator_notification_deliveries(event_id);
CREATE UNIQUE INDEX operator_notification_delivery_route ON private.operator_notification_deliveries(event_id,route_id) WHERE route_id IS NOT NULL;
CREATE UNIQUE INDEX operator_notification_delivery_email ON private.operator_notification_deliveries(event_id) WHERE transport='email';
CREATE INDEX operator_notification_delivery_ready ON private.operator_notification_deliveries(next_attempt_at,id) WHERE state IN ('pending','leased');
CREATE INDEX operator_notification_delivery_retention ON private.operator_notification_deliveries(finished_at,id) WHERE state IN ('sent','failed','cancelled');
ALTER TABLE private.operator_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.operator_notification_deliveries FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.fanout_operator_notification_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.kind='admission-approved' THEN
  INSERT INTO private.operator_notification_deliveries(event_id,transport) VALUES(NEW.id,'email');
 ELSE
  INSERT INTO private.operator_notification_deliveries(event_id,route_id,bot_id,route_revision,secret_version,chat_id,topic_id,transport)
   SELECT NEW.id,r.id,b.id,r.revision,b.secret_version,r.chat_id,r.topic_id,'telegram'
   FROM private.operator_notification_routes r JOIN private.operator_notification_bots b ON b.id=r.bot_id
   WHERE r.enabled AND r.kind=NEW.kind AND b.credential_state='ready';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER operator_notification_fanout AFTER INSERT ON private.operator_notification_events
 FOR EACH ROW EXECUTE FUNCTION private.fanout_operator_notification_v1();
REVOKE ALL ON FUNCTION private.fanout_operator_notification_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.operator_delivery_claim_v1(p_limit integer DEFAULT 1) RETURNS SETOF jsonb
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
  'botId',d.bot_id,'secretVersion',d.secret_version,'chatId',d.chat_id,'topicId',d.topic_id,'email',e.admission_email,'feedbackId',e.feedback_id,
  'admissionStatus',a.status,'emailVerified',coalesce(u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=e.admission_email,false))
 FROM claimed d JOIN private.operator_notification_events e ON e.id=d.event_id
 LEFT JOIN private.admission_requests a ON a.email=e.admission_email LEFT JOIN auth.users u ON u.id=a.user_id;
END; $$;
CREATE FUNCTION public.operator_delivery_settle_v1(p_id uuid,p_lease uuid,p_outcome text,p_delay integer DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
 IF p_id IS NULL OR p_lease IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('sent','retry','failed','cancelled')
  OR (p_outcome='retry' AND (p_delay IS NULL OR p_delay NOT BETWEEN 1 AND 86400)) THEN
  RAISE EXCEPTION 'invalid_settlement' USING ERRCODE='22023'; END IF;
 UPDATE private.operator_notification_deliveries SET
  state=CASE WHEN p_outcome='retry' AND attempts>=10 THEN 'failed' WHEN p_outcome='retry' THEN 'pending' ELSE p_outcome END,
  next_attempt_at=CASE WHEN p_outcome='retry' AND attempts<10 THEN clock_timestamp()+make_interval(secs=>p_delay) ELSE next_attempt_at END,
  finished_at=CASE WHEN p_outcome<>'retry' OR attempts>=10 THEN clock_timestamp() ELSE NULL END,lease_id=NULL,lease_until=NULL
 WHERE id=p_id AND state='leased' AND lease_id=p_lease AND lease_until>clock_timestamp();
 GET DIAGNOSTICS affected=ROW_COUNT;RETURN affected=1;
END; $$;
REVOKE ALL ON FUNCTION public.operator_delivery_claim_v1(integer),public.operator_delivery_settle_v1(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operator_delivery_claim_v1(integer),public.operator_delivery_settle_v1(uuid,uuid,text,integer) TO service_role;

CREATE FUNCTION private.enqueue_operator_admission_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_settings WHERE singleton AND enabled) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.status='pending' THEN
  INSERT INTO private.operator_notification_events(kind,admission_email) VALUES('admission-request',NEW.email);
 ELSIF TG_OP='UPDATE' AND OLD.status<>'approved' AND NEW.status='approved' AND NEW.decided_by IS NOT NULL
   AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=NEW.user_id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=NEW.email) THEN
  INSERT INTO private.operator_notification_events(kind,admission_email) VALUES('admission-approved',NEW.email);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER operator_admission_event AFTER INSERT OR UPDATE OF status ON private.admission_requests
 FOR EACH ROW EXECUTE FUNCTION private.enqueue_operator_admission_v1();

CREATE FUNCTION private.enqueue_operator_feedback_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_settings WHERE singleton AND enabled) THEN RETURN NEW; END IF;
 INSERT INTO private.operator_notification_events(kind,feedback_id) VALUES('feedback',NEW.id);
 RETURN NEW;
END; $$;
CREATE TRIGGER operator_feedback_event AFTER INSERT ON public.feedback_items
 FOR EACH ROW EXECUTE FUNCTION private.enqueue_operator_feedback_v1();

-- Preserve the admission control -> request lock ordering used by the existing
-- mutation. A request-event UUID is the opaque callback identity and expires.
CREATE FUNCTION private.operator_notification_decide_v1(p_event uuid,p_operator uuid,p_action text,p_request uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE email_value text; current_status text; event_time timestamptz;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('approve','reject') OR p_request IS NULL THEN RAISE EXCEPTION 'invalid_action' USING ERRCODE='22023'; END IF;
 -- Hold the operator row through the decision so a concurrent revocation
 -- serializes with this action rather than racing a stale authorization check.
 PERFORM 1 FROM public.admin_operators WHERE user_id=p_operator AND is_active
  AND 'admission.manage'=ANY(permissions) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'admission_operator_required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM private.admission_control WHERE singleton FOR UPDATE;
 SELECT e.admission_email,e.created_at INTO email_value,event_time FROM private.operator_notification_events e
  WHERE e.id=p_event AND e.kind='admission-request';
 IF email_value IS NULL OR event_time < clock_timestamp()-interval '7 days' THEN RETURN 'expired'; END IF;
 SELECT status INTO current_status FROM private.admission_requests WHERE email=email_value FOR UPDATE;
 IF current_status IS DISTINCT FROM 'pending' THEN RETURN 'already_decided'; END IF;
 PERFORM public.admin_admission_mutate(p_operator,p_action,ARRAY[email_value],NULL,p_request);
 RETURN 'decided';
END; $$;

CREATE FUNCTION public.operator_delivery_decide_v1(p_delivery uuid,p_bot uuid,p_version text,p_chat text,p_topic bigint,p_operator uuid,p_action text,p_request uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event uuid;
BEGIN
 PERFORM 1 FROM private.operator_notification_settings WHERE singleton AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN 'expired'; END IF;
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
REVOKE ALL ON FUNCTION public.operator_delivery_decide_v1(uuid,uuid,text,text,bigint,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operator_delivery_decide_v1(uuid,uuid,text,text,bigint,uuid,text,uuid) TO service_role;

CREATE FUNCTION public.operator_notification_status_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('pending',count(*) FILTER(WHERE state='pending'),
  'leased',count(*) FILTER(WHERE state='leased'), 'failed',count(*) FILTER(WHERE state='failed'),
  'oldestPendingAt',min(created_at) FILTER(WHERE state IN ('pending','leased')))
 FROM private.operator_notification_deliveries;
$$;
CREATE FUNCTION public.operator_notification_cleanup_v1() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer; parents integer;
BEGIN
 WITH expired AS (
  SELECT id FROM private.operator_notification_deliveries WHERE
   (state IN ('sent','cancelled') AND finished_at<clock_timestamp()-interval '30 days')
   OR (state='failed' AND finished_at<clock_timestamp()-interval '90 days')
  ORDER BY finished_at,id FOR UPDATE SKIP LOCKED LIMIT 500
 ) DELETE FROM private.operator_notification_deliveries d USING expired e WHERE d.id=e.id;
 GET DIAGNOSTICS removed=ROW_COUNT;
 WITH expired AS (
  SELECT e.id FROM private.operator_notification_events e WHERE e.created_at<clock_timestamp()-interval '30 days'
   AND NOT EXISTS(SELECT 1 FROM private.operator_notification_deliveries d WHERE d.event_id=e.id)
  ORDER BY e.created_at,e.id FOR UPDATE SKIP LOCKED LIMIT 500
 ) DELETE FROM private.operator_notification_events e USING expired x WHERE e.id=x.id;
 GET DIAGNOSTICS parents=ROW_COUNT; RETURN removed+parents;
END; $$;
REVOKE ALL ON FUNCTION public.operator_notification_status_v1(),public.operator_notification_cleanup_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operator_notification_status_v1(),public.operator_notification_cleanup_v1() TO service_role;

REVOKE ALL ON FUNCTION private.enqueue_operator_admission_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enqueue_operator_feedback_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.operator_notification_decide_v1(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
