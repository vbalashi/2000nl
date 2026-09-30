-- Independent, client-measured card attention. Never a review/FSRS mutation.
BEGIN;
CREATE TABLE private.training_active_time_coverage_v1 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO private.training_active_time_coverage_v1(singleton) VALUES (true);
CREATE TABLE private.training_active_time_v1 (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_id uuid NOT NULL,
  -- Frozen receipt identities survive expiry/cleanup of session read models.
  session_id uuid NOT NULL,
  family text NOT NULL CHECK (family IN ('meaning','idiom','sentence')),
  entry_id uuid NOT NULL,
  card_type_id text,
  target_id uuid,
  language_code text NOT NULL,
  dictionary_id uuid,
  active_ms integer NOT NULL CHECK (active_ms BETWEEN 1 AND 30000),
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id,measurement_id),
  CHECK ((family='meaning' AND card_type_id IS NOT NULL AND target_id IS NULL)
    OR (family IN ('idiom','sentence') AND card_type_id IS NULL AND target_id IS NOT NULL))
);
CREATE INDEX training_active_time_user_observed_idx
  ON private.training_active_time_v1(user_id,observed_at);
ALTER TABLE private.training_active_time_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.training_active_time_coverage_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.training_active_time_v1,private.training_active_time_coverage_v1
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_training_active_time_v1(
 p_measurement_id uuid,p_session_id uuid,p_family text,p_entry_id uuid,
 p_card_type_id text,p_target_id uuid,p_active_ms integer,p_observed_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE
 principal uuid := (select auth.uid());
 existing private.training_active_time_v1%ROWTYPE;
 entry_language text;
 entry_dictionary uuid;
 session_started timestamptz;
 v_now timestamptz := clock_timestamp();
BEGIN
 IF principal IS NULL THEN RETURN jsonb_build_object('error','unauthorized'); END IF;
 IF p_measurement_id IS NULL OR p_session_id IS NULL OR p_entry_id IS NULL
  OR p_family IS NULL OR p_family NOT IN ('meaning','idiom','sentence')
  OR p_active_ms IS NULL OR p_active_ms NOT BETWEEN 1 AND 30000
  OR p_observed_at IS NULL OR NOT isfinite(p_observed_at)
  OR (p_family='meaning' AND (p_card_type_id IS NULL OR p_target_id IS NOT NULL))
  OR (p_family<>'meaning' AND (p_card_type_id IS NOT NULL OR p_target_id IS NULL)) THEN
  RETURN jsonb_build_object('error','invalid_measurement');
 END IF;
 -- Serialize one principal's immutable IDs, including concurrent transport retries.
 PERFORM pg_advisory_xact_lock(hashtextextended(principal::text,187));
 SELECT * INTO existing FROM private.training_active_time_v1
  WHERE user_id=principal AND measurement_id=p_measurement_id;
 IF FOUND THEN
  IF existing.session_id=p_session_id AND existing.family=p_family
   AND existing.entry_id=p_entry_id AND existing.card_type_id IS NOT DISTINCT FROM p_card_type_id
   AND existing.target_id IS NOT DISTINCT FROM p_target_id AND existing.active_ms=p_active_ms
   AND existing.observed_at=p_observed_at THEN RETURN jsonb_build_object('accepted',true,'duplicate',true); END IF;
  RETURN jsonb_build_object('error','measurement_conflict');
 END IF;
 IF p_observed_at < v_now-interval '24 hours' OR p_observed_at > v_now+interval '1 minute' THEN
  RETURN jsonb_build_object('error','measurement_out_of_window'); END IF;
 SELECT created_at INTO session_started FROM public.training_sessions
  WHERE id=p_session_id AND user_id=principal;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','measurement_not_owned'); END IF;
 IF p_observed_at-(p_active_ms*interval '1 millisecond') < session_started-interval '1 minute' THEN
  RETURN jsonb_build_object('error','measurement_out_of_window'); END IF;
 IF p_family='meaning' THEN
  IF NOT EXISTS (SELECT 1 FROM public.training_session_members
   WHERE session_id=p_session_id AND entry_id=p_entry_id AND card_type_id=p_card_type_id) THEN
   RETURN jsonb_build_object('error','measurement_not_owned'); END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM public.training_session_exercise_members m
   JOIN private.platform_v2_training_exercise_targets t ON t.id=m.target_id
   WHERE m.session_id=p_session_id AND m.target_id=p_target_id AND t.entry_id=p_entry_id
    AND t.family=CASE p_family WHEN 'sentence' THEN 'translation' ELSE 'idiom' END) THEN
   RETURN jsonb_build_object('error','measurement_not_owned'); END IF;
 END IF;
 SELECT language_code,dictionary_id INTO entry_language,entry_dictionary
  FROM public.word_entries WHERE id=p_entry_id;
 IF entry_language IS NULL THEN RETURN jsonb_build_object('error','measurement_not_owned'); END IF;
 INSERT INTO private.training_active_time_v1(user_id,measurement_id,session_id,family,entry_id,
  card_type_id,target_id,language_code,dictionary_id,active_ms,observed_at)
 VALUES(principal,p_measurement_id,p_session_id,p_family,p_entry_id,p_card_type_id,p_target_id,
  entry_language,entry_dictionary,p_active_ms,p_observed_at);
 RETURN jsonb_build_object('accepted',true,'duplicate',false);
END;
$$;

CREATE FUNCTION public.get_training_active_time_v1(p_start_date date,p_end_date date,p_language_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE
 principal uuid := (select auth.uid());
 timezone text;
 days jsonb;
 coverage timestamptz;
BEGIN
 IF principal IS NULL THEN RETURN jsonb_build_object('error','unauthorized'); END IF;
 IF p_start_date IS NULL OR p_end_date IS NULL OR NOT isfinite(p_start_date) OR NOT isfinite(p_end_date)
  OR p_end_date<p_start_date OR p_end_date-p_start_date>365
  OR (p_language_code IS NOT NULL AND p_language_code !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$') THEN
  RETURN jsonb_build_object('error','invalid_time_range'); END IF;
 timezone := private.training_user_timezone_v1(principal);
 SELECT started_at INTO coverage FROM private.training_active_time_coverage_v1 WHERE singleton;
 WITH bounds AS (
  SELECT study_date::date AS date,(study_date::date+time '04:00') AT TIME ZONE timezone AS starts,
   (study_date::date+1+time '04:00') AT TIME ZONE timezone AS ends
  FROM generate_series(0,p_end_date-p_start_date) AS offset_days(i)
  CROSS JOIN LATERAL (SELECT p_start_date+i AS study_date) d
 ), totals AS (
  SELECT b.date,floor(COALESCE(sum(extract(epoch FROM
   LEAST(t.observed_at,b.ends)-GREATEST(t.observed_at-t.active_ms*interval '1 millisecond',b.starts))*1000) FILTER (WHERE t.measurement_id IS NOT NULL),0))::bigint AS ms
  FROM bounds b LEFT JOIN private.training_active_time_v1 t
   ON t.user_id=principal AND t.observed_at>b.starts AND t.observed_at<b.ends+interval '30 seconds'
    AND t.observed_at-t.active_ms*interval '1 millisecond'<b.ends
    AND (p_language_code IS NULL OR t.language_code=p_language_code)
  GROUP BY b.date
 ) SELECT jsonb_agg(jsonb_build_object('date',date,'activeMilliseconds',ms) ORDER BY date) INTO days FROM totals;
 RETURN jsonb_build_object('coverageStartedAt',coverage,'timezone',timezone,'days',days);
END;
$$;
ALTER FUNCTION public.record_training_active_time_v1(uuid,uuid,text,uuid,text,uuid,integer,timestamptz) OWNER TO postgres;
ALTER FUNCTION public.get_training_active_time_v1(date,date,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_training_active_time_v1(uuid,uuid,text,uuid,text,uuid,integer,timestamptz),
 public.get_training_active_time_v1(date,date,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_training_active_time_v1(uuid,uuid,text,uuid,text,uuid,integer,timestamptz),
 public.get_training_active_time_v1(date,date,text) TO authenticated;
COMMENT ON TABLE private.training_active_time_v1 IS 'Immutable bounded attention receipts; not a review or scheduling action. Language/material are server-derived. Observed active intervals split across learner-local 04:00 days at read time.';
COMMIT;
