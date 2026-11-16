-- Server-only generation leases and technical admission across UI replicas.
-- No source text or credentials are stored. Artifacts can contain private results.
BEGIN;
CREATE TABLE private.provider_work (
  kind text NOT NULL CHECK (kind IN ('text','draft','tts-public','tts-entry')),
  family text GENERATED ALWAYS AS (CASE WHEN kind IN ('text','draft') THEN 'translation' ELSE 'audio' END) STORED,
  identity text NOT NULL CHECK (identity ~ '^[a-f0-9]{64}$'),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','ready','failed')),
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  lease_token uuid,
  lease_expires_at timestamptz,
  available_at timestamptz NOT NULL,
  result jsonb,
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(kind,identity),
  CHECK ((status='pending' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR (status<>'pending' AND lease_token IS NULL AND lease_expires_at IS NULL)),
  CHECK (result IS NULL OR (status='ready' AND jsonb_typeof(result)='object' AND octet_length(result::text)<=12582912))
);
CREATE INDEX provider_work_active ON private.provider_work(family,lease_expires_at,account_id) WHERE status='pending';
CREATE INDEX provider_work_abandoned ON private.provider_work(lease_expires_at) WHERE status='pending';
CREATE INDEX provider_work_failed_retention ON private.provider_work(updated_at) WHERE status='failed';
ALTER TABLE private.provider_work ENABLE ROW LEVEL SECURITY;
CREATE TABLE private.provider_admission_windows (
  family text NOT NULL CHECK(family IN ('translation','audio')),
  subject text NOT NULL,
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK(requests>=0),
  input_characters bigint NOT NULL CHECK(input_characters>=0),
  PRIMARY KEY(family,subject)
);
CREATE INDEX provider_admission_retention ON private.provider_admission_windows(window_started_at);
ALTER TABLE private.provider_admission_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.provider_work,private.provider_admission_windows FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.begin_provider_work_v1(p_kind text,p_identity text,p_account_id uuid,p_input_characters integer,p_limits jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
#variable_conflict use_column
<<admission>>
DECLARE w private.provider_work%rowtype; b private.provider_admission_windows%rowtype;
 family text; now_at timestamptz; subject text; subjects text[]; request_limit integer; character_limit integer;
 account_requests integer; global_requests integer; account_characters integer; global_characters integer;
 account_concurrency integer; global_concurrency integer; wait_ms integer; active integer; claimed_attempt integer; token uuid;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('text','draft','tts-public','tts-entry') OR p_identity IS NULL OR p_identity !~ '^[a-f0-9]{64}$'
 OR p_account_id IS NULL OR p_input_characters IS NULL OR p_input_characters NOT BETWEEN 1 AND 100000
 OR jsonb_typeof(p_limits) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_provider_work' USING ERRCODE='22023'; END IF;
 account_requests:=(p_limits->>'accountRequests')::integer; global_requests:=(p_limits->>'globalRequests')::integer;
 account_characters:=(p_limits->>'accountCharacters')::integer; global_characters:=(p_limits->>'globalCharacters')::integer;
 account_concurrency:=(p_limits->>'accountConcurrency')::integer; global_concurrency:=(p_limits->>'globalConcurrency')::integer;
 IF account_requests IS NULL OR account_requests NOT BETWEEN 1 AND 1000 OR global_requests IS NULL OR global_requests NOT BETWEEN 1 AND 10000
 OR account_characters IS NULL OR account_characters NOT BETWEEN 1 AND 100000000 OR global_characters IS NULL OR global_characters NOT BETWEEN 1 AND 1000000000
 OR account_concurrency IS NULL OR account_concurrency NOT BETWEEN 1 AND 32 OR global_concurrency IS NULL OR global_concurrency NOT BETWEEN 1 AND 128
 THEN RAISE EXCEPTION 'invalid_provider_limits' USING ERRCODE='22023'; END IF;
 family:=CASE WHEN p_kind IN ('text','draft') THEN 'translation' ELSE 'audio' END;
 -- One short transaction serializes admission for a resource family. Never held across provider I/O.
 PERFORM pg_advisory_xact_lock(hashtextextended('provider-admission:'||family,0));
 now_at:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_account_id) THEN RAISE EXCEPTION 'provider_account_missing' USING ERRCODE='42501'; END IF;
 SELECT * INTO w FROM private.provider_work WHERE kind=p_kind AND identity=p_identity FOR UPDATE;
 IF FOUND THEN
   -- Text/draft identities are account scoped by the server; also enforce ownership here.
   IF p_kind IN ('text','draft') AND w.account_id<>p_account_id THEN RAISE EXCEPTION 'provider_work_forbidden' USING ERRCODE='42501'; END IF;
   IF w.status='ready' THEN RETURN jsonb_build_object('status','ready','result',w.result); END IF;
   IF w.status='pending' AND w.lease_expires_at>now_at THEN
     RETURN jsonb_build_object('status','pending','retryAfterMs',1000);
   END IF;
   IF w.status='pending' THEN
     w.available_at:=w.lease_expires_at+make_interval(secs=>CASE WHEN w.attempt=3 THEN 900 WHEN w.attempt=1 THEN 5 ELSE 20 END);
     UPDATE private.provider_work SET status='failed',lease_token=NULL,lease_expires_at=NULL,error_code='provider_timeout',available_at=w.available_at,updated_at=now_at
       WHERE kind=p_kind AND identity=p_identity;
     w.error_code:='provider_timeout';
   END IF;
   IF w.available_at>now_at THEN
     RETURN jsonb_build_object('status','failed','error',coalesce(w.error_code,'provider_unknown_error'),'retryAfterMs',ceil(extract(epoch FROM w.available_at-now_at)*1000)::integer);
   END IF;
 END IF;
 SELECT count(*) INTO active FROM private.provider_work WHERE status='pending' AND lease_expires_at>now_at
   AND provider_work.family=admission.family;
 IF active>=global_concurrency THEN RETURN jsonb_build_object('status','limited','retryAfterMs',1000); END IF;
 SELECT count(*) INTO active FROM private.provider_work WHERE status='pending' AND lease_expires_at>now_at AND account_id=p_account_id
   AND provider_work.family=admission.family;
 IF active>=account_concurrency THEN RETURN jsonb_build_object('status','limited','retryAfterMs',1000); END IF;
 subjects:=ARRAY['global',p_account_id::text];
 -- Check both buckets before charging either; denied/cache/coalesced requests consume no generation units.
 FOREACH subject IN ARRAY subjects LOOP
   SELECT * INTO b FROM private.provider_admission_windows a WHERE a.family=admission.family AND a.subject=admission.subject;
   request_limit:=CASE WHEN subject='global' THEN global_requests ELSE account_requests END;
   character_limit:=CASE WHEN subject='global' THEN global_characters ELSE account_characters END;
   IF p_input_characters>character_limit THEN RETURN jsonb_build_object('status','limited','retryAfterMs',60000); END IF;
   IF FOUND AND b.window_started_at>now_at-interval '60 seconds'
      AND (b.requests>=request_limit OR b.input_characters+p_input_characters>character_limit) THEN
     wait_ms:=ceil(extract(epoch FROM b.window_started_at+interval '60 seconds'-now_at)*1000)::integer;
     RETURN jsonb_build_object('status','limited','retryAfterMs',greatest(1,wait_ms));
   END IF;
 END LOOP;
 FOREACH subject IN ARRAY subjects LOOP
   INSERT INTO private.provider_admission_windows AS a(family,subject,window_started_at,requests,input_characters)
     VALUES(family,subject,now_at,1,p_input_characters)
   ON CONFLICT(family,subject) DO UPDATE SET
     window_started_at=CASE WHEN a.window_started_at<=now_at-interval '60 seconds' THEN now_at ELSE a.window_started_at END,
     requests=CASE WHEN a.window_started_at<=now_at-interval '60 seconds' THEN 1 ELSE a.requests+1 END,
     input_characters=CASE WHEN a.window_started_at<=now_at-interval '60 seconds' THEN p_input_characters ELSE a.input_characters+p_input_characters END;
 END LOOP;
 token:=gen_random_uuid();
 INSERT INTO private.provider_work(kind,identity,account_id,status,attempt,lease_token,lease_expires_at,available_at)
 VALUES(p_kind,p_identity,p_account_id,'pending',1,token,now_at+interval '300 seconds',now_at)
 ON CONFLICT(kind,identity) DO UPDATE SET account_id=p_account_id,status='pending',
   attempt=CASE WHEN provider_work.attempt=3 THEN 1 ELSE provider_work.attempt+1 END,
   lease_token=token,lease_expires_at=now_at+interval '300 seconds',available_at=now_at,result=NULL,error_code=NULL,updated_at=now_at
 RETURNING attempt INTO claimed_attempt;
 RETURN jsonb_build_object('status','claimed','leaseToken',token,'attempt',claimed_attempt);
END $$;

CREATE FUNCTION public.finish_provider_work_v1(p_kind text,p_identity text,p_lease_token uuid,p_result jsonb DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE w private.provider_work%rowtype; now_at timestamptz;
BEGIN
 SELECT * INTO w FROM private.provider_work WHERE kind=p_kind AND identity=p_identity FOR UPDATE;
 now_at:=clock_timestamp();
 IF NOT FOUND OR w.status<>'pending' OR w.lease_token IS DISTINCT FROM p_lease_token OR w.lease_expires_at<=now_at THEN RETURN false; END IF;
 IF (p_result IS NULL)=(p_error_code IS NULL) OR (p_result IS NOT NULL AND (jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>12582912))
 OR (p_error_code IS NOT NULL AND p_error_code NOT IN ('provider_http_error','provider_response_error','provider_empty_response','provider_timeout','provider_network_error','provider_fallback_error','provider_unknown_error','audio_generation_failed'))
 THEN RAISE EXCEPTION 'invalid_provider_result' USING ERRCODE='22023'; END IF;
 UPDATE private.provider_work SET status=CASE WHEN p_result IS NOT NULL THEN 'ready' ELSE 'failed' END,
   result=p_result,error_code=p_error_code,lease_token=NULL,lease_expires_at=NULL,updated_at=now_at,
   available_at=now_at+make_interval(secs=>CASE WHEN p_result IS NOT NULL THEN 0 WHEN attempt=3 THEN 900 WHEN attempt=1 THEN 5 ELSE 20 END)
 WHERE kind=p_kind AND identity=p_identity;
 RETURN true;
END $$;
CREATE FUNCTION public.read_provider_work_v1(p_kind text,p_identity text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
 SELECT result FROM private.provider_work WHERE kind=p_kind AND identity=p_identity AND status='ready';
$$;
REVOKE ALL ON FUNCTION public.begin_provider_work_v1(text,text,uuid,integer,jsonb),public.finish_provider_work_v1(text,text,uuid,jsonb,text),public.read_provider_work_v1(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_provider_work_v1(text,text,uuid,integer,jsonb),public.finish_provider_work_v1(text,text,uuid,jsonb,text),public.read_provider_work_v1(text,text) TO service_role;
COMMENT ON TABLE private.provider_work IS 'Server-only provider artifacts and fenced 300s leases; no source text. Text/draft identities are account scoped. TTS results are shared only behind their existing public/private delivery boundary.';
-- Stale failed work and admission counters do not accumulate forever. Pending work
-- is recovered by begin; ready artifacts retain the established persistent cache policy.
SELECT cron.schedule('provider-work-retention','17 * * * *',$job$
 DELETE FROM private.provider_admission_windows WHERE (family,subject) IN
   (SELECT family,subject FROM private.provider_admission_windows WHERE window_started_at<clock_timestamp()-interval '1 day' ORDER BY window_started_at LIMIT 1000 FOR UPDATE SKIP LOCKED);
 DELETE FROM private.provider_work WHERE (kind,identity) IN
   (SELECT kind,identity FROM private.provider_work WHERE status='pending' AND lease_expires_at<clock_timestamp()-interval '1 day' ORDER BY lease_expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED);
 DELETE FROM private.provider_work WHERE (kind,identity) IN
   (SELECT kind,identity FROM private.provider_work WHERE status='failed' AND updated_at<clock_timestamp()-interval '7 days' ORDER BY updated_at LIMIT 1000 FOR UPDATE SKIP LOCKED);
$job$);
NOTIFY pgrst,'reload schema';
COMMIT;
