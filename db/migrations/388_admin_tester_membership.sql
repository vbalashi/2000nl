BEGIN;

ALTER TABLE public.admin_operators DROP CONSTRAINT admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators ADD CONSTRAINT admin_operators_permissions_allowed CHECK (permissions <@ ARRAY['dictionaries.read','audit.read','publication.manage','dictionary.content.read','users.read','admission.manage','feedback.read','editorial.edit','notifications.manage','testers.manage']::text[]);
ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_allowed;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_allowed CHECK (action = ANY (ARRAY['auth.sign_in','auth.sign_in_denied','auth.sign_out','access.denied','dictionary.registry.read','dictionary.metadata.read','dictionary.content.read','dictionary.publication.updated','dictionary.audience.updated','audit.journal.read','user.registry.read','user.profile.read','admission.approve','admission.reject','admission.revoke','admission.invite','admission.mode','admission.auto_approve','feedback.registry.read','feedback.detail.read','operator.permissions.updated','notifications.configuration.read','notifications.configuration.updated','user.access.read','user.activity.read','user.testers.added','user.testers.removed']::text[]));

CREATE FUNCTION public.admin_user_tester_access(
  p_operator uuid, p_user uuid, p_request uuid,
  p_member boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  group_id_value uuid;
  group_name text;
  group_description text;
  operator_permissions text[];
  changed boolean;
BEGIN
  SELECT permissions INTO operator_permissions FROM public.admin_operators
    WHERE user_id = p_operator AND is_active FOR SHARE;
  IF NOT coalesce('users.read' = ANY(operator_permissions), false)
    OR (p_member IS NOT NULL AND NOT coalesce('testers.manage' = ANY(operator_permissions), false)) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_member IS NOT NULL THEN
    PERFORM 1 FROM auth.users WHERE id = p_user FOR NO KEY UPDATE;
  ELSE
    PERFORM 1 FROM auth.users WHERE id = p_user;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  SELECT id, name, nullif(btrim(description), '') INTO group_id_value, group_name, group_description
    FROM public.dictionary_access_groups WHERE key = 'testers' FOR SHARE;
  IF p_member IS NOT NULL AND group_id_value IS NULL THEN
    RETURN jsonb_build_object('error', 'group_unavailable');
  END IF;

  IF p_member IS NULL THEN
    INSERT INTO public.admin_audit_events(operator_user_id, action, outcome, target_type, target_id, request_id)
    VALUES (p_operator, 'user.access.read', 'success', 'user_profile', p_user::text, p_request);
  ELSE
    IF p_member THEN
      INSERT INTO public.dictionary_access_group_members(group_id, user_id)
      VALUES (group_id_value, p_user) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.dictionary_access_group_members WHERE group_id = group_id_value AND user_id = p_user;
    END IF;
    changed := FOUND;
    IF changed THEN
      INSERT INTO public.admin_audit_events(operator_user_id, action, outcome, target_type, target_id, request_id)
      VALUES (p_operator, CASE WHEN p_member THEN 'user.testers.added' ELSE 'user.testers.removed' END,
        'success', 'user_profile', p_user::text, p_request);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'groups', CASE WHEN group_id_value IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
      'id', 'testers',
      'name', group_name,
      'description', group_description,
      'member', EXISTS (SELECT 1 FROM public.dictionary_access_group_members WHERE group_id = group_id_value AND user_id = p_user)
    )) END,
    'operatorActive', EXISTS (SELECT 1 FROM public.admin_operators WHERE user_id = p_user AND is_active)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_user_tester_access(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_tester_access(uuid, uuid, uuid, boolean) TO service_role;
-- Completion is explicit; exhausted or legacy rows without a recorded reason
-- are not counted as successful completions.
CREATE INDEX training_sessions_user_completed_idx
  ON public.training_sessions (user_id, completed_at DESC)
  WHERE completion_reason = 'completed';

CREATE FUNCTION public.admin_user_activity(
  p_operator uuid, p_user uuid, p_request uuid, p_days integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  as_of timestamptz := statement_timestamp();
  period_start timestamptz;
  activity jsonb;
  last_observed timestamptz;
BEGIN
  PERFORM 1 FROM public.admin_operators
    WHERE user_id = p_operator AND is_active AND 'users.read' = ANY(permissions)
    FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;

  IF p_days IS NULL OR p_days NOT IN (7, 30, 90) THEN
    RETURN jsonb_build_object('error', 'invalid_period');
  END IF;

  -- Apply the same learner visibility rule as admin_user_registry_page.
  PERFORM 1 FROM auth.users AS account
    WHERE account.id = p_user
      AND (EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = account.id)
        OR NOT EXISTS (
          SELECT 1 FROM public.admin_operators AS operator_account
          WHERE operator_account.user_id = account.id
            OR operator_account.email = lower(btrim(coalesce(account.email, '')))
        ))
    FOR KEY SHARE;
  IF NOT FOUND THEN
    INSERT INTO public.admin_audit_events(operator_user_id, action, outcome, target_type, target_id, request_id)
    VALUES (p_operator, 'user.activity.read', 'failure', 'user_profile', p_user::text, p_request);
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  period_start := (((as_of AT TIME ZONE 'UTC')::date - (p_days - 1))::timestamp AT TIME ZONE 'UTC');
  WITH events AS (
    SELECT created_at AS at, 'start' AS kind FROM public.training_sessions
    WHERE user_id = p_user AND created_at >= period_start AND created_at < as_of
    UNION ALL
    SELECT completed_at, 'complete' FROM public.training_sessions
    WHERE user_id = p_user AND completion_reason = 'completed'
      AND completed_at >= period_start AND completed_at < as_of
    UNION ALL
    SELECT reviewed_at, 'action' FROM public.user_review_log
    WHERE user_id = p_user AND grade BETWEEN 1 AND 4
      AND reviewed_at >= period_start AND reviewed_at < as_of
    UNION ALL
    SELECT created_at, 'action' FROM public.user_card_action_events
    WHERE user_id = p_user AND action = 'start-learning'
      AND created_at >= period_start AND created_at < as_of
    UNION ALL
    SELECT created_at, 'action' FROM public.user_training_exercise_action_events
    WHERE user_id = p_user AND action = 'review-exercise' AND result IN ('fail', 'hard', 'success', 'easy')
      AND created_at >= period_start AND created_at < as_of
  )
  SELECT jsonb_build_object(
    'periodStart', period_start,
    'asOf', as_of,
    'activeDays', count(DISTINCT (at AT TIME ZONE 'UTC')::date),
    'sessionsStarted', count(*) FILTER (WHERE kind = 'start'),
    'sessionsCompleted', count(*) FILTER (WHERE kind = 'complete'),
    'acceptedActions', count(*) FILTER (WHERE kind = 'action'),
    'lastObservedAt', max(at)
  ) INTO activity FROM events;

  -- If the selected range is empty, find the latest older record with indexed
  -- one-row lookups. This keeps the last-observed metric useful for inactive users.
  IF activity->>'lastObservedAt' IS NULL THEN
    SELECT greatest(
      (SELECT created_at FROM public.training_sessions WHERE user_id = p_user
        AND created_at < period_start ORDER BY created_at DESC LIMIT 1),
      (SELECT completed_at FROM public.training_sessions WHERE user_id = p_user AND completion_reason = 'completed'
        AND completed_at < period_start ORDER BY completed_at DESC LIMIT 1),
      (SELECT reviewed_at FROM public.user_review_log WHERE user_id = p_user AND grade BETWEEN 1 AND 4
        AND reviewed_at < period_start ORDER BY reviewed_at DESC LIMIT 1),
      (SELECT created_at FROM public.user_card_action_events WHERE user_id = p_user AND action = 'start-learning'
        AND created_at < period_start ORDER BY created_at DESC LIMIT 1),
      (SELECT created_at FROM public.user_training_exercise_action_events WHERE user_id = p_user
        AND action = 'review-exercise' AND result IN ('fail', 'hard', 'success', 'easy')
        AND created_at < period_start ORDER BY created_at DESC LIMIT 1)
    ) INTO last_observed;
    activity := activity || jsonb_build_object('lastObservedAt', last_observed);
  END IF;

  INSERT INTO public.admin_audit_events(operator_user_id, action, outcome, target_type, target_id, request_id)
  VALUES (p_operator, 'user.activity.read', 'success', 'user_profile', p_user::text, p_request);
  RETURN activity;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_user_activity(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_activity(uuid, uuid, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
