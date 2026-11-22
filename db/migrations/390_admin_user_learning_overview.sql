BEGIN;

-- Only accepted ratings contribute to the calendar and streaks. Meaning review
-- receipts and independent exercise receipts have separate identities.
CREATE FUNCTION private.admin_learning_answers_v1(p_user uuid, p_start timestamptz, p_end timestamptz)
RETURNS TABLE(answered_at timestamptz, language_code text)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT r.reviewed_at, w.language_code
  FROM public.user_review_log r JOIN public.word_entries w ON w.id = r.word_id
  WHERE r.user_id = p_user AND r.grade BETWEEN 1 AND 4
    AND r.reviewed_at >= p_start AND r.reviewed_at < p_end
  UNION ALL
  SELECT e.created_at, w.language_code
  FROM public.user_training_exercise_action_events e
  JOIN private.platform_v2_training_exercise_targets t ON t.id = e.target_id
  JOIN public.word_entries w ON w.id = t.entry_id
  WHERE e.user_id = p_user AND e.action = 'review-exercise'
    AND e.result IN ('fail', 'hard', 'success', 'easy')
    AND e.created_at >= p_start AND e.created_at < p_end
$$;
REVOKE ALL ON FUNCTION private.admin_learning_answers_v1(uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.admin_learning_sessions_v1(
  p_user uuid, p_language text, p_start timestamptz, p_end timestamptz, p_now timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH sessions AS MATERIALIZED (
    SELECT s.*,
      CASE
        WHEN s.training_filter #>> '{librarySelection,labelId}' IS NOT NULL THEN 'label'
        WHEN personal.user_id = p_user THEN 'personal'
        WHEN personal.id IS NOT NULL THEN 'received'
        WHEN curated.id IS NOT NULL THEN 'curated'
        WHEN s.training_filter ? 'dictionaryScope' THEN 'dictionary'
        ELSE 'unknown'
      END AS source
    FROM public.training_sessions s
    LEFT JOIN public.user_word_lists personal ON personal.id = s.list_id
    LEFT JOIN public.word_lists curated ON curated.id = s.list_id
    WHERE s.user_id = p_user AND s.created_at >= p_start AND s.created_at < p_end
      AND (p_language IS NULL OR COALESCE(
        NULLIF(s.training_filter #>> '{dictionaryScope,languageCode}', ''),
        NULLIF(s.training_filter #>> '{librarySelection,languageCode}', ''),
        personal.primary_language_code, personal.language_code, curated.primary_language_code, curated.language_code
      ) = p_language OR EXISTS (
        SELECT 1 FROM private.training_active_time_v1 t
        WHERE t.user_id = p_user AND t.session_id = s.id AND t.language_code = p_language
      ))
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT 101
  ), details AS (
    SELECT s.*, m.ms,
      EXISTS (SELECT 1 FROM public.training_session_members item WHERE item.session_id = s.id AND item.consumed_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.training_session_exercise_members item WHERE item.session_id = s.id AND item.consumed_at IS NOT NULL) AS progressed
    FROM (SELECT * FROM sessions ORDER BY created_at DESC, id DESC LIMIT 100) s
    LEFT JOIN LATERAL (
      SELECT sum(t.active_ms)::bigint AS ms FROM private.training_active_time_v1 t
      WHERE t.user_id = p_user AND t.session_id = s.id
    ) m ON true
  )
  SELECT jsonb_build_object(
    'sessions', COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'startedAt', created_at, 'source', source, 'cards', planned_total, 'activeMilliseconds', ms,
      'mode', CASE WHEN training_filter->>'reviewTiming' = 'early' THEN 'early' ELSE card_filter END,
      'outcome', CASE
        WHEN completion_reason = 'completed' THEN 'completed'
        WHEN planned_total = 0 AND completed_at IS NOT NULL AND NOT progressed THEN 'empty'
        WHEN completion_reason = 'exhausted' THEN 'exhausted'
        WHEN (superseded_at IS NOT NULL OR expires_at <= p_now) AND NOT progressed THEN 'no_answers'
        WHEN superseded_at IS NOT NULL OR expires_at <= p_now THEN 'interrupted'
        WHEN completed_at IS NULL THEN 'open'
        ELSE 'unclassified'
      END
    ) ORDER BY created_at DESC, id DESC), '[]'::jsonb),
    'hasMore', (SELECT count(*) > 100 FROM sessions)
  ) FROM details
$$;
REVOKE ALL ON FUNCTION private.admin_learning_sessions_v1(uuid,text,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.admin_learning_material_v1(
  p_user uuid, p_language text, p_month_start timestamptz, p_now timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH owned AS (
    SELECT l.id FROM public.user_word_lists l
    WHERE l.user_id = p_user AND (p_language IS NULL OR COALESCE(l.primary_language_code,l.language_code) = p_language)
  ), subscribed AS (
    SELECT r.collection_id AS id FROM private.live_collection_sharing_subscriptions_v1 r
    JOIN public.user_word_lists l ON l.id = r.collection_id
    WHERE r.user_id = p_user AND (p_language IS NULL OR COALESCE(l.primary_language_code,l.language_code) = p_language)
  ), used AS (
    SELECT DISTINCT s.list_id FROM public.training_sessions s
    WHERE s.user_id = p_user AND s.list_type = 'user' AND s.created_at >= p_month_start AND s.created_at < p_now
      AND (EXISTS (SELECT 1 FROM public.training_session_members item WHERE item.session_id=s.id AND item.consumed_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM public.training_session_exercise_members item WHERE item.session_id=s.id AND item.consumed_at IS NOT NULL))
  ), shared AS (
    SELECT r.id FROM private.collection_sharing_roots r JOIN owned l ON l.id = r.collection_id
    WHERE r.owner_user_id = p_user AND r.is_open
  ), learning AS (
    SELECT c.entry_id, c.in_learning, COALESCE(c.learning_due_at,c.next_review_at) AS due_at
    FROM public.user_card_status c JOIN public.word_entries w ON w.id = c.entry_id
    WHERE c.user_id = p_user AND NOT COALESCE(c.hidden,false) AND w.archived_at IS NULL
      AND (c.frozen_until IS NULL OR c.frozen_until <= p_now)
      AND (p_language IS NULL OR w.language_code = p_language)
      AND (c.in_learning OR (c.fsrs_enabled AND c.fsrs_reps > 0))
  )
  SELECT jsonb_build_object(
    'learningWords', (SELECT count(DISTINCT entry_id) FROM learning WHERE in_learning),
    'dueCards', (SELECT count(*) FROM learning WHERE due_at <= p_now),
    'personalLists', (SELECT count(*) FROM owned),
    'usedPersonalLists', (SELECT count(*) FROM owned JOIN used ON used.list_id = owned.id),
    'subscriptions', (SELECT count(*) FROM subscribed),
    'usedSubscriptions', (SELECT count(*) FROM subscribed JOIN used ON used.list_id = subscribed.id),
    'sharedLists', (SELECT count(*) FROM shared),
    'sharedWithSubscribers', (SELECT count(*) FROM shared WHERE EXISTS (
      SELECT 1 FROM private.live_collection_sharing_subscriptions_v1 v WHERE v.root_id = shared.id
    ))
  )
$$;
REVOKE ALL ON FUNCTION private.admin_learning_material_v1(uuid,text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_user_learning_overview_v1(
  p_operator uuid, p_user uuid, p_request uuid, p_language text DEFAULT NULL, p_day date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  zone text;
  today date;
  first_day date;
  as_of timestamptz := statement_timestamp();
  first_time timestamptz;
  coverage timestamptz;
  last_activity timestamptz;
  overview jsonb;
BEGIN
  PERFORM 1 FROM public.admin_operators WHERE user_id = p_operator AND is_active
    AND 'users.read' = ANY(permissions) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','forbidden'); END IF;

  IF p_language IS NOT NULL AND (length(p_language) > 35 OR NOT EXISTS (
    SELECT 1 FROM public.languages WHERE code = p_language
  )) THEN RETURN jsonb_build_object('error','invalid_selection'); END IF;

  PERFORM 1 FROM auth.users AS account WHERE account.id = p_user
    AND (EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = account.id)
      OR NOT EXISTS (SELECT 1 FROM public.admin_operators AS operator_account
        WHERE operator_account.user_id = account.id OR operator_account.email = lower(btrim(coalesce(account.email,'')))))
    FOR KEY SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  zone := private.training_user_timezone_v1(p_user);
  today := private.training_study_day_date_v1(as_of, zone);
  first_day := today - 364;
  IF p_day IS NOT NULL AND (p_day < first_day OR p_day > today) THEN
    RETURN jsonb_build_object('error','invalid_selection');
  END IF;

  IF p_day IS NOT NULL THEN
    overview := private.admin_learning_sessions_v1(p_user, p_language,
      (p_day + time '04:00') AT TIME ZONE zone,
      least(as_of, (p_day + 1 + time '04:00') AT TIME ZONE zone), as_of);
  ELSE
    first_time := (first_day + time '04:00') AT TIME ZONE zone;
    SELECT started_at INTO coverage FROM private.training_active_time_coverage_v1 WHERE singleton;
    -- Keep the newest evidence available even when outside the calendar window.
    SELECT greatest(
      (SELECT r.reviewed_at FROM public.user_review_log r JOIN public.word_entries w ON w.id=r.word_id
       WHERE r.user_id=p_user AND r.grade BETWEEN 1 AND 4 AND r.reviewed_at < as_of
         AND (p_language IS NULL OR w.language_code=p_language) ORDER BY r.reviewed_at DESC LIMIT 1),
      (SELECT e.created_at FROM public.user_training_exercise_action_events e
       JOIN private.platform_v2_training_exercise_targets t ON t.id=e.target_id
       JOIN public.word_entries w ON w.id=t.entry_id
       WHERE e.user_id=p_user AND e.action='review-exercise' AND e.result IN ('fail','hard','success','easy')
         AND e.created_at < as_of AND (p_language IS NULL OR w.language_code=p_language)
       ORDER BY e.created_at DESC LIMIT 1),
      (SELECT t.observed_at FROM private.training_active_time_v1 t WHERE t.user_id=p_user
         AND t.observed_at < as_of AND (p_language IS NULL OR t.language_code=p_language)
       ORDER BY t.observed_at DESC LIMIT 1)
    ) INTO last_activity;
    WITH answers AS MATERIALIZED (
      SELECT * FROM private.admin_learning_answers_v1(p_user,first_time,as_of)
    ), rates AS (
      SELECT private.training_study_day_date_v1(answered_at,zone) AS day, count(*) AS answers
      FROM answers WHERE p_language IS NULL OR language_code = p_language GROUP BY 1
    ), bounds AS (
      SELECT day, (day + time '04:00') AT TIME ZONE zone AS starts,
        least(as_of,(day + 1 + time '04:00') AT TIME ZONE zone) AS ends
      FROM generate_series(0,364) index CROSS JOIN LATERAL (SELECT first_day+index AS day) d
    ), configured AS MATERIALIZED (
      SELECT item->>'code' AS code, (item->>'paused')::boolean AS paused
      FROM public.user_settings u CROSS JOIN LATERAL jsonb_array_elements(u.material_preferences->'learningLanguages') item
      WHERE u.user_id = p_user
    ), defaults AS (
      SELECT d.language_code FROM public.dictionaries d
      WHERE NOT EXISTS (SELECT 1 FROM configured) AND public.can_browse_dictionary(p_user,d.id,'read')
        AND EXISTS (SELECT 1 FROM private.active_word_entries w WHERE w.dictionary_id=d.id AND w.language_code=d.language_code)
      UNION SELECT c.language_code FROM public.word_lists c
      WHERE NOT EXISTS (SELECT 1 FROM configured) AND EXISTS (SELECT 1 FROM public.word_list_items i WHERE i.list_id=c.id)
      UNION SELECT COALESCE(l.primary_language_code,l.language_code) FROM public.user_word_lists l
      WHERE NOT EXISTS (SELECT 1 FROM configured) AND l.user_id=p_user
        AND EXISTS (SELECT 1 FROM public.user_word_list_items i WHERE i.list_id=l.id)
    ), days AS (
      SELECT b.day, b.ends, COALESCE(r.answers,0) AS answers, attention.ms
      FROM bounds b LEFT JOIN rates r USING(day)
      LEFT JOIN LATERAL (
        SELECT floor(sum(extract(epoch FROM least(t.observed_at,b.ends) -
          greatest(t.observed_at-t.active_ms*interval '1 millisecond',b.starts))*1000))::bigint AS ms
        FROM private.training_active_time_v1 t
        WHERE t.user_id=p_user AND t.observed_at>b.starts
          AND t.observed_at<least(as_of,b.ends+interval '30 seconds')
          AND t.observed_at-t.active_ms*interval '1 millisecond'<b.ends
          AND (p_language IS NULL OR t.language_code=p_language)
      ) attention ON true
    )
    SELECT jsonb_build_object(
      'timezone', zone,
      'lastActivityAt', last_activity,
      'days', (SELECT jsonb_agg(jsonb_build_object('date',day,'answers',answers,'activeMilliseconds',
        COALESCE(ms,CASE WHEN ends > coverage THEN 0 END)) ORDER BY day) FROM days),
      'languages', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code',l.code,'name',l.name,'status',CASE
        WHEN c.paused THEN 'paused' WHEN c.code IS NOT NULL THEN 'active'
        WHEN d.language_code IS NOT NULL THEN 'default' ELSE 'historical' END) ORDER BY l.name,l.code),'[]'::jsonb)
       FROM public.languages l LEFT JOIN configured c ON c.code=l.code LEFT JOIN defaults d ON d.language_code=l.code
       WHERE c.code IS NOT NULL OR d.language_code IS NOT NULL OR l.code IN (SELECT language_code FROM answers)),
      'material', private.admin_learning_material_v1(p_user,p_language,(today-29+time '04:00') AT TIME ZONE zone,as_of)
    ) INTO overview;
  END IF;

  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES (p_operator,'user.activity.read','success','user_profile',p_user::text,p_request);
  RETURN overview;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_user_learning_overview_v1(uuid,uuid,uuid,text,date)
  FROM PUBLIC, anon, authenticated, authenticator, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.admin_user_learning_overview_v1(uuid,uuid,uuid,text,date) TO service_role;

-- The existing access panel owns group writes. This companion view exposes
-- only bounded membership history to operators who can read the audit journal.
CREATE FUNCTION public.admin_user_access_details_v1(p_operator uuid, p_user uuid, p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  capabilities text[];
  history jsonb;
  assigned jsonb;
  operator_permissions jsonb;
BEGIN
  SELECT permissions INTO capabilities FROM public.admin_operators
  WHERE user_id=p_operator AND is_active FOR SHARE;
  IF NOT COALESCE('users.read'=ANY(capabilities),false) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT CASE WHEN o.is_active THEN to_jsonb(o.permissions) ELSE '[]'::jsonb END INTO operator_permissions
  FROM public.admin_operators o WHERE o.user_id=p_user;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',g.key,'name',g.name,'description',NULLIF(btrim(g.description),''))
    ORDER BY g.name,g.key),'[]'::jsonb) INTO assigned
  FROM public.dictionary_access_group_members m JOIN public.dictionary_access_groups g ON g.id=m.group_id
  WHERE m.user_id=p_user AND g.key <> 'testers';

  IF 'audit.read'=ANY(capabilities) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('at',h.created_at,'action',h.action,'operatorId',h.operator_user_id)
      ORDER BY h.created_at DESC,h.id DESC),'[]'::jsonb) INTO history
    FROM (
      SELECT a.created_at,a.id,a.action,a.operator_user_id FROM public.admin_audit_events a
      WHERE a.target_type='user_profile' AND a.target_id=p_user::text AND a.outcome='success'
        AND a.action IN ('user.testers.added','user.testers.removed')
      ORDER BY a.created_at DESC,a.id DESC LIMIT 20
    ) h;
  END IF;

  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES (p_operator,'user.access.read','success','user_profile',p_user::text,p_request);
  RETURN jsonb_build_object('assignedGroups',assigned,'operatorPermissions',COALESCE(operator_permissions,'[]'::jsonb),'history',history);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_user_access_details_v1(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, authenticator, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.admin_user_access_details_v1(uuid,uuid,uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
