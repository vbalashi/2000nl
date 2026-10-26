-- Verify the single study-day boundary and persisted-timezone authority after
-- migration 147.
\i db/deploy-contract/postflight-146.sql

DO $postflight_local_study_day_authority$
DECLARE
  filter_local_date_fn regprocedure := to_regprocedure(
    'private.training_filter_local_date(timestamp with time zone,text)'
  );
  study_day_bounds_fn regprocedure := to_regprocedure(
    'private.training_study_day_bounds_v1(timestamp with time zone,text)'
  );
  authoritative_timezone_fn regprocedure := to_regprocedure(
    'private.training_authoritative_timezone_v1(uuid,text)'
  );
  filter_target_date_fn regprocedure := to_regprocedure(
    'private.training_filter_target_date(jsonb)'
  );
  filter_target_date_at_fn regprocedure := to_regprocedure(
    'private.training_filter_target_date_at(jsonb,timestamp with time zone)'
  );
  calendar_local_date_fn regprocedure := to_regprocedure(
    'private.training_calendar_local_date_v1(timestamp with time zone,text)'
  );
  next_meaning_fn regprocedure := to_regprocedure(
    'private.next_ordinary_meaning_available_at_v1(timestamp with time zone,text)'
  );
  stats_fn regprocedure := to_regprocedure(
    'public.get_detailed_training_stats(uuid,text[],uuid,text,text)'
  );
  filter_local_date_definition text;
  study_day_bounds_definition text;
  authoritative_timezone_definition text;
  filter_target_date_at_definition text;
  filter_target_date_definition text;
  calendar_local_date_definition text;
  next_meaning_definition text;
  stats_definition text;
BEGIN
  IF filter_local_date_fn IS NULL
     OR study_day_bounds_fn IS NULL
     OR authoritative_timezone_fn IS NULL
     OR filter_target_date_fn IS NULL
     OR filter_target_date_at_fn IS NULL
     OR calendar_local_date_fn IS NULL
     OR next_meaning_fn IS NULL
     OR stats_fn IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-study-day-authority-signatures';
  END IF;

  IF (SELECT proc.prorows FROM pg_proc proc WHERE proc.oid = study_day_bounds_fn) <> 1 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed study-day-bounds-row-estimate';
  END IF;

  filter_local_date_definition := upper(pg_get_functiondef(filter_local_date_fn));
  study_day_bounds_definition := upper(pg_get_functiondef(study_day_bounds_fn));
  authoritative_timezone_definition := upper(pg_get_functiondef(authoritative_timezone_fn));
  filter_target_date_at_definition := upper(pg_get_functiondef(filter_target_date_at_fn));
  filter_target_date_definition := upper(pg_get_functiondef(filter_target_date_fn));
  calendar_local_date_definition := upper(pg_get_functiondef(calendar_local_date_fn));
  next_meaning_definition := upper(pg_get_functiondef(next_meaning_fn));
  stats_definition := upper(pg_get_functiondef(stats_fn));

  IF position('TRAINING_STUDY_DAY_DATE_V1' IN filter_local_date_definition) = 0
     OR position('TRAINING_AUTHORITATIVE_TIMEZONE_V1' IN filter_local_date_definition) = 0
     OR position('TRAINING_AUTHORITATIVE_TIMEZONE_V1' IN study_day_bounds_definition) = 0
     OR position('TRAINING_USER_TIMEZONE_V1' IN authoritative_timezone_definition) = 0
     OR position('TRAINING_STUDY_DAY_DATE_V1' IN filter_target_date_at_definition) = 0
     OR position('TRAINING_AUTHORITATIVE_TIMEZONE_V1' IN filter_target_date_at_definition) = 0
     OR position('TRAINING_FILTER_TARGET_DATE_AT' IN filter_target_date_definition) = 0
     OR position('AT TIME ZONE' IN calendar_local_date_definition) = 0
     OR position('TRAINING_CALENDAR_LOCAL_DATE_V1' IN next_meaning_definition) = 0
     OR position('TRAINING_USER_TIMEZONE_V1' IN stats_definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed local-study-day-authority-routing';
  END IF;
END
$postflight_local_study_day_authority$;
