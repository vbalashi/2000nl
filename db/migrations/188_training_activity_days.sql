-- Read-only learner activity per 04:00 study day for Statistics.
-- Counts reuse the current study-day counter definitions across exercise families:
-- new = first introduction (start-learning or first graded 'new' review; first
-- self-assessed exercise review); reviews = later graded reviews. History is not
-- filtered by current dictionary access or material preferences.
BEGIN;
CREATE FUNCTION public.get_training_activity_days_v1(p_language_code text DEFAULT NULL,p_days integer DEFAULT 366)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE
 principal uuid := (select auth.uid());
 v_timezone text;
 v_today date;
 v_first date;
 v_starts timestamptz;
 v_ends timestamptz;
 v_active jsonb;
 v_days jsonb;
BEGIN
 IF principal IS NULL THEN RETURN jsonb_build_object('error','unauthorized'); END IF;
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 366
  OR (p_language_code IS NOT NULL AND p_language_code !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$') THEN
  RETURN jsonb_build_object('error','invalid_activity_range'); END IF;
 v_timezone := private.training_user_timezone_v1(principal);
 v_today := private.training_study_day_date_v1(clock_timestamp(),v_timezone);
 v_first := v_today-(p_days-1);
 v_starts := (v_first+time '04:00') AT TIME ZONE v_timezone;
 v_ends := (v_today+1+time '04:00') AT TIME ZONE v_timezone;
 -- Measured time keeps a single attribution authority (migration 187).
 v_active := public.get_training_active_time_v1(v_first,v_today,p_language_code);
 IF v_active ? 'error' OR v_active->>'timezone' IS DISTINCT FROM v_timezone THEN
  RETURN jsonb_build_object('error','activity_unavailable'); END IF;
 WITH meaning_new AS (
  SELECT private.training_study_day_date_v1(e.created_at,v_timezone) AS day,e.entry_id,e.card_type_id
  FROM public.user_card_action_events e JOIN public.word_entries w ON w.id=e.entry_id
  WHERE e.user_id=principal AND e.action='start-learning' AND e.created_at>=v_starts AND e.created_at<v_ends
   AND (p_language_code IS NULL OR w.language_code=p_language_code)
  UNION
  SELECT private.training_study_day_date_v1(r.reviewed_at,v_timezone),r.word_id,r.mode
  FROM public.user_review_log r JOIN public.word_entries w ON w.id=r.word_id
  WHERE r.user_id=principal AND r.review_type='new' AND r.reviewed_at>=v_starts AND r.reviewed_at<v_ends
   AND (p_language_code IS NULL OR w.language_code=p_language_code)
 ), meaning_reviews AS (
  SELECT private.training_study_day_date_v1(r.reviewed_at,v_timezone) AS day,count(*) AS n
  FROM public.user_review_log r JOIN public.word_entries w ON w.id=r.word_id
  WHERE r.user_id=principal AND r.review_type='review' AND r.reviewed_at>=v_starts AND r.reviewed_at<v_ends
   AND (p_language_code IS NULL OR w.language_code=p_language_code)
  GROUP BY 1
 ), exercise AS (
  SELECT private.training_study_day_date_v1(e.created_at,v_timezone) AS day,
   NOT EXISTS (SELECT 1 FROM public.user_training_exercise_action_events earlier
    WHERE earlier.user_id=principal AND earlier.target_id=e.target_id
     AND earlier.action='review-exercise' AND earlier.created_at<e.created_at) AS introduced
  FROM public.user_training_exercise_action_events e
  JOIN private.platform_v2_training_exercise_targets t ON t.id=e.target_id
  JOIN public.word_entries w ON w.id=t.entry_id
  WHERE e.user_id=principal AND e.action='review-exercise' AND e.created_at>=v_starts AND e.created_at<v_ends
   AND (p_language_code IS NULL OR w.language_code=p_language_code)
 ), counts AS (
  SELECT day,sum(fresh)::integer AS fresh,sum(reviews)::integer AS reviews FROM (
   SELECT day,count(*) AS fresh,0::bigint AS reviews FROM meaning_new GROUP BY day
   UNION ALL SELECT day,0,n FROM meaning_reviews
   UNION ALL SELECT day,count(*) FILTER (WHERE introduced),count(*) FILTER (WHERE NOT introduced) FROM exercise GROUP BY day
  ) parts GROUP BY day
 )
 SELECT jsonb_agg(jsonb_build_object('date',d.date,'newCount',COALESCE(c.fresh,0),'reviewCount',COALESCE(c.reviews,0),
   'activeMilliseconds',(a->>'activeMilliseconds')::bigint) ORDER BY d.date)
 INTO v_days
 FROM jsonb_array_elements(v_active->'days') a
 CROSS JOIN LATERAL (SELECT (a->>'date')::date AS date) d
 LEFT JOIN counts c ON c.day=d.date;
 RETURN jsonb_build_object('timezone',v_timezone,'today',v_today,
  'coverageStartedAt',v_active->'coverageStartedAt','days',v_days);
END;
$$;
ALTER FUNCTION public.get_training_activity_days_v1(text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_training_activity_days_v1(text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_training_activity_days_v1(text,integer) TO authenticated;
COMMENT ON FUNCTION public.get_training_activity_days_v1(text,integer) IS 'Own learner activity per learner-local 04:00 study day ending today; read-only, no scheduler state.';
COMMIT;
