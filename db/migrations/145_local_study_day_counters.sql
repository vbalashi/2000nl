-- Attribute training counters to a learner-local study day.
--
-- The study day starts at 04:00 in the learner's IANA timezone. This is a
-- reporting boundary only: it does not change FSRS instants or finite-session
-- budgets. IANA zone rules are used for both endpoints so DST days can be
-- 23 or 25 hours long without inventing a fixed offset.

BEGIN;

CREATE OR REPLACE FUNCTION private.training_user_timezone_v1(
  p_user_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.training_schedule_timezone_v1(
    COALESCE(
      NULLIF(trim(settings.training_schedule_timezone), ''),
      'UTC'
    )
  )
  FROM public.user_settings settings
  WHERE settings.user_id = p_user_id
  UNION ALL
  SELECT 'UTC'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_settings settings
    WHERE settings.user_id = p_user_id
  )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.training_study_day_date_v1(
  p_timestamp timestamptz,
  p_timezone text
)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT (
    (
      p_timestamp AT TIME ZONE private.training_schedule_timezone_v1(p_timezone)
    ) - interval '4 hours'
  )::date;
$$;

CREATE OR REPLACE FUNCTION private.training_study_day_bounds_v1(
  p_now timestamptz,
  p_timezone text
)
RETURNS TABLE(
  study_date date,
  start_at timestamptz,
  end_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  WITH normalized AS (
    SELECT
      private.training_schedule_timezone_v1(p_timezone) AS timezone,
      private.training_study_day_date_v1(p_now, p_timezone) AS study_date
  )
  SELECT
    normalized.study_date,
    (
      normalized.study_date::timestamp + interval '4 hours'
    ) AT TIME ZONE normalized.timezone,
    (
      (normalized.study_date + 1)::timestamp + interval '4 hours'
    ) AT TIME ZONE normalized.timezone
  FROM normalized;
$$;

CREATE OR REPLACE FUNCTION private.training_local_daily_stats_v1(
  p_user_id uuid,
  p_modes text[],
  p_list_id uuid,
  p_list_type text,
  p_timezone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_modes text[] := p_modes;
  v_list_type text := COALESCE(p_list_type, 'curated');
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_study_day_start timestamptz;
  v_study_day_end timestamptz;
BEGIN
  IF v_modes IS NULL OR cardinality(v_modes) = 0 THEN
    v_modes := ARRAY['word-to-definition'];
  END IF;

  v_timezone := private.training_schedule_timezone_v1(
    COALESCE(
      NULLIF(trim(p_timezone), ''),
      private.training_user_timezone_v1(p_user_id),
      'UTC'
    )
  );

  SELECT bounds.start_at, bounds.end_at
  INTO v_study_day_start, v_study_day_end
  FROM private.training_study_day_bounds_v1(v_now, v_timezone) bounds;

  RETURN (
    WITH accessible_entries AS (
      SELECT w.id
      FROM word_entries w
      WHERE (w.dictionary_id IS NULL OR can_access_dictionary(p_user_id, w.dictionary_id, 'read'))
        AND (
              (p_list_id IS NULL AND w.is_nt2_2000 = true)
           OR (p_list_id IS NOT NULL AND v_list_type = 'curated' AND EXISTS (
                  SELECT 1 FROM word_list_items li
                  WHERE li.list_id = p_list_id AND li.word_id = w.id
              ))
           OR (p_list_id IS NOT NULL AND v_list_type = 'user' AND EXISTS (
                  SELECT 1 FROM user_word_list_items li
                  JOIN user_word_lists l ON l.id = li.list_id
                  WHERE li.list_id = p_list_id
                    AND li.word_id = w.id
                    AND l.user_id = p_user_id
              ))
        )
    ), introduced_cards AS (
      SELECT e.entry_id, e.card_type_id
      FROM user_card_action_events e
      WHERE e.user_id = p_user_id
        AND e.card_type_id = ANY(v_modes)
        AND e.action = 'start-learning'
        AND e.created_at >= v_study_day_start
        AND e.created_at < v_study_day_end
      UNION
      SELECT rl.word_id, rl.mode
      FROM user_review_log rl
      WHERE rl.user_id = p_user_id
        AND rl.mode = ANY(v_modes)
        AND rl.review_type = 'new'
        AND rl.reviewed_at >= v_study_day_start
        AND rl.reviewed_at < v_study_day_end
    ), introduced_metrics AS (
      SELECT
        COUNT(DISTINCT introduced.entry_id)::int AS new_words_today,
        COUNT(*)::int AS new_cards_today
      FROM introduced_cards introduced
      JOIN accessible_entries accessible ON accessible.id = introduced.entry_id
    ), learning_metrics AS (
      SELECT COUNT(*)::int AS learning_started_today
      FROM (
        SELECT DISTINCT e.entry_id, e.card_type_id
        FROM user_card_action_events e
        JOIN accessible_entries accessible ON accessible.id = e.entry_id
        WHERE e.user_id = p_user_id
          AND e.card_type_id = ANY(v_modes)
          AND e.action = 'start-learning'
          AND e.created_at >= v_study_day_start
          AND e.created_at < v_study_day_end
      ) started
    ), graduated_metrics AS (
      SELECT COUNT(DISTINCT rl.word_id)::int AS graduated_new_words_today
      FROM user_review_log rl
      JOIN accessible_entries accessible ON accessible.id = rl.word_id
      WHERE rl.user_id = p_user_id
        AND rl.mode = ANY(v_modes)
        AND rl.review_type = 'new'
        AND rl.reviewed_at >= v_study_day_start
        AND rl.reviewed_at < v_study_day_end
        AND rl.interval_after >= 1.0
    ), review_metrics AS (
      SELECT
        COUNT(DISTINCT rl.word_id)::int AS review_words_done,
        COUNT(*)::int AS review_cards_done
      FROM user_review_log rl
      JOIN accessible_entries accessible ON accessible.id = rl.word_id
      WHERE rl.user_id = p_user_id
        AND rl.mode = ANY(v_modes)
        AND rl.review_type = 'review'
        AND rl.reviewed_at >= v_study_day_start
        AND rl.reviewed_at < v_study_day_end
    ), due_metrics AS (
      SELECT
        COUNT(DISTINCT s.entry_id)::int AS review_words_due,
        COUNT(*)::int AS review_cards_due
      FROM user_card_status s
      JOIN accessible_entries accessible ON accessible.id = s.entry_id
      WHERE s.user_id = p_user_id
        AND s.card_type_id = ANY(v_modes)
        AND s.next_review_at < v_study_day_end
        AND (s.frozen_until IS NULL OR s.frozen_until <= v_now)
        AND s.hidden = false
        AND s.fsrs_enabled = true
        AND NOT EXISTS (
          SELECT 1
          FROM user_review_log rl
          WHERE rl.user_id = s.user_id
            AND rl.word_id = s.entry_id
            AND rl.mode = s.card_type_id
            AND rl.review_type = 'new'
            AND rl.reviewed_at >= v_study_day_start
            AND rl.reviewed_at < v_study_day_end
        )
    )
    SELECT jsonb_build_object(
      'newWordsToday', introduced.new_words_today,
      'newCardsToday', introduced.new_cards_today,
      'learningStartedToday', learning.learning_started_today,
      'graduatedNewWordsToday', graduated.graduated_new_words_today,
      'reviewWordsDone', reviews.review_words_done,
      'reviewCardsDone', reviews.review_cards_done,
      'reviewWordsDue', due.review_words_due,
      'reviewCardsDue', due.review_cards_due
    )
    FROM introduced_metrics introduced
    CROSS JOIN learning_metrics learning
    CROSS JOIN graduated_metrics graduated
    CROSS JOIN review_metrics reviews
    CROSS JOIN due_metrics due
  );
END;
$$;

-- Keep the previous implementation as a private compatibility primitive for
-- total/list metrics, then expose the timezone-aware public contract. The
-- guarded move also lets the cold-schema drift harness replay this migration
-- while restoring a deliberately altered database.
DO $move_legacy_stats_function$
BEGIN
  IF to_regprocedure(
       'private.get_detailed_training_stats_utc_legacy_v1(uuid,text[],uuid,text)'
     ) IS NOT NULL THEN
    NULL;
  ELSIF to_regprocedure(
          'public.get_detailed_training_stats(uuid,text[],uuid,text)'
        ) IS NOT NULL THEN
    ALTER FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text)
      RENAME TO get_detailed_training_stats_utc_legacy_v1;
    ALTER FUNCTION public.get_detailed_training_stats_utc_legacy_v1(uuid, text[], uuid, text)
      SET SCHEMA private;
  ELSE
    RAISE EXCEPTION 'db-contract-gate: migration-145-legacy-stats-move-incomplete';
  END IF;
END
$move_legacy_stats_function$;

CREATE OR REPLACE FUNCTION public.get_detailed_training_stats(
  p_user_id uuid,
  p_modes text[],
  p_list_id uuid,
  p_list_type text,
  p_timezone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  base_stats jsonb;
  local_stats jsonb;
BEGIN
  IF (select auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;

  base_stats := private.get_detailed_training_stats_utc_legacy_v1(
    p_user_id, p_modes, p_list_id, p_list_type
  );
  local_stats := private.training_local_daily_stats_v1(
    p_user_id, p_modes, p_list_id, p_list_type, p_timezone
  );
  RETURN COALESCE(base_stats, '{}'::jsonb) || COALESCE(local_stats, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_detailed_training_stats(
  p_user_id uuid,
  p_modes text[] DEFAULT ARRAY['word-to-definition'],
  p_list_id uuid DEFAULT NULL,
  p_list_type text DEFAULT 'curated'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  RETURN public.get_detailed_training_stats(
    p_user_id,
    p_modes,
    p_list_id,
    p_list_type,
    private.training_user_timezone_v1(p_user_id)
  );
END;
$$;

ALTER FUNCTION private.training_user_timezone_v1(uuid) OWNER TO postgres;
ALTER FUNCTION private.training_study_day_date_v1(timestamptz, text) OWNER TO postgres;
ALTER FUNCTION private.training_study_day_bounds_v1(timestamptz, text) OWNER TO postgres;
ALTER FUNCTION private.training_local_daily_stats_v1(uuid, text[], uuid, text, text) OWNER TO postgres;
ALTER FUNCTION private.get_detailed_training_stats_utc_legacy_v1(uuid, text[], uuid, text) OWNER TO postgres;
ALTER FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text) OWNER TO postgres;
ALTER FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.training_user_timezone_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_study_day_date_v1(timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_study_day_bounds_v1(timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_local_daily_stats_v1(uuid, text[], uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.get_detailed_training_stats_utc_legacy_v1(uuid, text[], uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text) IS
  'Authenticated training statistics attributed to the learner-local 04:00 study day.';
COMMENT ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text) IS
  'Authenticated training statistics using the learner timezone stored in user settings.';

COMMIT;
