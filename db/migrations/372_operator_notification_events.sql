BEGIN;

CREATE TABLE private.operator_notification_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO private.operator_notification_settings(singleton) VALUES(true);
REVOKE ALL ON private.operator_notification_settings FROM PUBLIC,anon,authenticated,service_role;

-- The queue stores references, not snapshots of email or report evidence.  Workers
-- are privileged server-side consumers; it is never exposed to browser roles.
CREATE TABLE private.operator_notification_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('admission-request','admission-approved','feedback')),
 admission_email text REFERENCES private.admission_requests(email) ON DELETE CASCADE,
 feedback_id uuid REFERENCES public.feedback_items(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','sent','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,
 lease_until timestamptz,
 CHECK ((kind='feedback' AND feedback_id IS NOT NULL AND admission_email IS NULL)
     OR (kind<>'feedback' AND admission_email IS NOT NULL AND feedback_id IS NULL)),
 CHECK ((state='leased') = (lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX operator_notification_ready ON private.operator_notification_events(next_attempt_at,created_at)
 WHERE state IN ('pending','leased');
CREATE UNIQUE INDEX operator_notification_feedback_once ON private.operator_notification_events(feedback_id)
 WHERE kind='feedback';
REVOKE ALL ON private.operator_notification_events FROM PUBLIC,anon,authenticated,service_role;

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

-- The lease token prevents a late worker from settling a subsequently reclaimed job.
CREATE FUNCTION public.operator_notification_claim_v1(p_limit integer DEFAULT 10)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.operator_notification_settings WHERE singleton AND enabled) THEN RETURN; END IF;
 RETURN QUERY WITH candidates AS (
  SELECT e.id FROM private.operator_notification_events e
  WHERE (e.state='pending' AND e.next_attempt_at<=clock_timestamp()) OR (e.state='leased' AND e.lease_until<clock_timestamp())
  ORDER BY e.next_attempt_at,e.created_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), claimed AS (
  UPDATE private.operator_notification_events e SET state='leased',lease_id=gen_random_uuid(),
   lease_until=clock_timestamp()+interval '2 minutes',attempts=e.attempts+1
  FROM candidates c WHERE e.id=c.id RETURNING e.*
 ) SELECT jsonb_build_object('id',c.id,'kind',c.kind,'leaseId',c.lease_id,'attempts',c.attempts,
   'createdAt',c.created_at,'email',c.admission_email,'feedbackId',c.feedback_id,
   'admissionStatus',a.status)
 FROM claimed c LEFT JOIN private.admission_requests a ON a.email=c.admission_email;
END; $$;

CREATE FUNCTION public.operator_notification_settle_v1(p_id uuid,p_lease uuid,p_outcome text,p_delay integer DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE affected integer;
BEGIN
 IF p_id IS NULL OR p_lease IS NULL OR p_outcome NOT IN ('sent','retry','failed') OR p_outcome IS NULL
 OR (p_outcome='retry' AND (p_delay IS NULL OR p_delay NOT BETWEEN 1 AND 86400)) THEN
  RAISE EXCEPTION 'invalid_settlement' USING ERRCODE='22023'; END IF;
 UPDATE private.operator_notification_events SET state=CASE WHEN p_outcome='retry' THEN 'pending' ELSE p_outcome END,
  next_attempt_at=CASE WHEN p_outcome='retry' THEN clock_timestamp()+make_interval(secs=>p_delay) ELSE next_attempt_at END,
  lease_id=NULL,lease_until=NULL
 WHERE id=p_id AND state='leased' AND lease_id=p_lease AND lease_until>clock_timestamp();
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected=1;
END; $$;

-- Preserve the admission control -> request lock ordering used by the existing
-- mutation. A request-event UUID is the opaque callback identity and expires.
CREATE FUNCTION public.operator_notification_decide_v1(p_event uuid,p_operator uuid,p_action text,p_request uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE email_value text; current_status text; event_time timestamptz;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('approve','reject') OR p_request IS NULL THEN RAISE EXCEPTION 'invalid_action' USING ERRCODE='22023'; END IF;
 PERFORM private.admission_operator(p_operator);
 PERFORM 1 FROM private.admission_control WHERE singleton FOR UPDATE;
 SELECT e.admission_email,e.created_at INTO email_value,event_time FROM private.operator_notification_events e
  WHERE e.id=p_event AND e.kind='admission-request';
 IF email_value IS NULL OR event_time < clock_timestamp()-interval '7 days' THEN RETURN 'expired'; END IF;
 SELECT status INTO current_status FROM private.admission_requests WHERE email=email_value FOR UPDATE;
 IF current_status IS DISTINCT FROM 'pending' THEN RETURN 'already_decided'; END IF;
 PERFORM public.admin_admission_mutate(p_operator,p_action,ARRAY[email_value],NULL,p_request);
 RETURN 'decided';
END; $$;

CREATE FUNCTION public.operator_notification_status_v1() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('pending',count(*) FILTER(WHERE state='pending'),
  'leased',count(*) FILTER(WHERE state='leased'), 'failed',count(*) FILTER(WHERE state='failed'),
  'oldestPendingAt',min(created_at) FILTER(WHERE state IN ('pending','leased')))
 FROM private.operator_notification_events;
$$;
CREATE FUNCTION public.operator_notification_cleanup_v1() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer;
BEGIN
 DELETE FROM private.operator_notification_events WHERE (state='sent' AND created_at<clock_timestamp()-interval '30 days')
   OR (state='failed' AND created_at<clock_timestamp()-interval '90 days');
 GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed;
END; $$;
REVOKE ALL ON FUNCTION public.operator_notification_status_v1(),public.operator_notification_cleanup_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operator_notification_status_v1(),public.operator_notification_cleanup_v1() TO service_role;

REVOKE ALL ON FUNCTION private.enqueue_operator_admission_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enqueue_operator_feedback_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.operator_notification_claim_v1(integer),public.operator_notification_settle_v1(uuid,uuid,text,integer),public.operator_notification_decide_v1(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operator_notification_claim_v1(integer),public.operator_notification_settle_v1(uuid,uuid,text,integer),public.operator_notification_decide_v1(uuid,uuid,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
