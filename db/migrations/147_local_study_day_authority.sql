-- Make the 04:00 study day the single date-filter boundary and keep the
-- persisted learner timezone authoritative for statistics.
--
-- Migration 146 already routes the canonical scheduler through
-- training_study_day_bounds_v1. This migration closes the remaining seams:
-- dateWindow filters use study-day dates, the sequential-introduction helper
-- keeps its historical local-midnight meaning, and stats no longer vary by
-- the browser that happens to request them.

BEGIN;

CREATE OR REPLACE FUNCTION private.training_calendar_local_date_v1(
  p_timestamp timestamptz,
  p_timezone text
)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT (
    p_timestamp AT TIME ZONE private.training_schedule_timezone_v1(p_timezone)
  )::date;
$$;

CREATE OR REPLACE FUNCTION private.training_authoritative_timezone_v1(
  p_user_id uuid,
  p_requested_timezone text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT private.training_schedule_timezone_v1(
    CASE
      WHEN p_user_id IS NULL
        THEN COALESCE(NULLIF(trim(p_requested_timezone), ''), 'UTC')
      ELSE private.training_user_timezone_v1(p_user_id)
    END
  );
$$;

CREATE OR REPLACE FUNCTION private.training_filter_local_date(
  p_timestamp timestamptz,
  p_timezone text
)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT private.training_study_day_date_v1(
    p_timestamp,
    private.training_authoritative_timezone_v1((select auth.uid()), p_timezone)
  );
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
  WITH timezone AS (
    SELECT private.training_authoritative_timezone_v1((select auth.uid()), p_timezone) AS timezone
  ), normalized AS (
    SELECT
      timezone.timezone,
      private.training_study_day_date_v1(
        p_now,
        timezone.timezone
      ) AS study_date
    FROM timezone
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

CREATE OR REPLACE FUNCTION private.training_filter_target_date_at(
  p_filter jsonb,
  p_reference_now timestamptz
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_timezone text := private.training_authoritative_timezone_v1((select auth.uid()), NULL);
  v_window text := COALESCE(NULLIF(trim(p_filter->>'dateWindow'), ''), 'all');
  v_days_ago int;
  v_today date;
BEGIN
  v_today := private.training_study_day_date_v1(
    COALESCE(p_reference_now, now()),
    v_timezone
  );

  IF v_window = 'today' THEN
    RETURN v_today;
  END IF;
  IF v_window = 'yesterday' THEN
    RETURN v_today - 1;
  END IF;
  IF v_window = 'daysAgo' THEN
    v_days_ago := GREATEST(0, LEAST(365, COALESCE(NULLIF(p_filter->>'daysAgo', '')::int, 0)));
    RETURN v_today - v_days_ago;
  END IF;

  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.training_filter_target_date(
  p_filter jsonb
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_target_date date;
BEGIN
  v_target_date := private.training_filter_target_date_at(p_filter, now());
  RETURN v_target_date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Sequential ordinary-meaning offers intentionally remain tied to the next
-- local calendar midnight. The study-day boundary is for counters and date
-- filters, not for this already accepted unlock promise.
CREATE OR REPLACE FUNCTION private.next_ordinary_meaning_available_at_v1(
  p_activated_at timestamptz,
  p_timezone text
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT (
    (
      private.training_calendar_local_date_v1(
        p_activated_at,
        private.training_schedule_timezone_v1(p_timezone)
      ) + 1
    )::timestamp AT TIME ZONE private.training_schedule_timezone_v1(p_timezone)
  );
$$;

-- The five-argument RPC remains for cached callers, but the account setting
-- is authoritative. A browser-provided timezone must not make one learner's
-- counters change when they switch devices; the stored setting is maintained
-- by the training-session timezone sync from migration 143.
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
    p_user_id,
    p_modes,
    p_list_id,
    p_list_type,
    private.training_user_timezone_v1(p_user_id)
  );
  RETURN COALESCE(base_stats, '{}'::jsonb) || COALESCE(local_stats, '{}'::jsonb);
END;
$$;

ALTER FUNCTION private.training_calendar_local_date_v1(timestamptz, text) OWNER TO postgres;
ALTER FUNCTION private.training_authoritative_timezone_v1(uuid, text) OWNER TO postgres;
ALTER FUNCTION private.training_filter_local_date(timestamptz, text) OWNER TO postgres;
ALTER FUNCTION private.training_study_day_bounds_v1(timestamptz, text) OWNER TO postgres;
ALTER FUNCTION private.training_filter_target_date_at(jsonb, timestamptz) OWNER TO postgres;
ALTER FUNCTION private.training_filter_target_date(jsonb) OWNER TO postgres;
ALTER FUNCTION private.next_ordinary_meaning_available_at_v1(timestamptz, text) OWNER TO postgres;
ALTER FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.training_calendar_local_date_v1(timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_authoritative_timezone_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_filter_local_date(timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_study_day_bounds_v1(timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_filter_target_date_at(jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.training_filter_target_date(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.next_ordinary_meaning_available_at_v1(timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION private.training_filter_local_date(timestamptz, text) IS
  'Study-day date (04:00-to-04:00) used by source/date training filters.';
COMMENT ON FUNCTION private.training_filter_target_date_at(jsonb, timestamptz) IS
  'Deterministic study-day target-date resolver using the authenticated learner timezone when the filter omits one.';
COMMENT ON FUNCTION private.training_calendar_local_date_v1(timestamptz, text) IS
  'Calendar date helper retained for next-local-midnight introduction unlocks.';
COMMENT ON FUNCTION private.training_authoritative_timezone_v1(uuid, text) IS
  'Returns the persisted learner timezone for authenticated scheduler/reporting paths; request timezone is only a fallback for unauthenticated internal calendar helpers.';
COMMENT ON FUNCTION public.get_detailed_training_stats(uuid, text[], uuid, text, text) IS
  'Authenticated stats projection using the persisted learner-local 04:00 study day; the timezone argument is retained for compatibility.';

COMMIT;
