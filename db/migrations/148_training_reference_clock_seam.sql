-- Give temporal integration tests one deterministic clock at the real SQL
-- boundaries without exposing a clock parameter through the public API.
--
-- The override is transaction-local and only readable from private SQL. When
-- it is absent, statement_timestamp() preserves the normal request-time
-- behavior while keeping all reads in one statement on one instant.

BEGIN;

CREATE OR REPLACE FUNCTION private.training_reference_now_v1()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE
  configured_now text := current_setting('training.test_reference_now', true);
BEGIN
  IF configured_now IS NULL OR btrim(configured_now) = '' THEN
    RETURN statement_timestamp();
  END IF;

  RETURN configured_now::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'invalid training.test_reference_now';
END;
$$;

ALTER FUNCTION private.training_reference_now_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.training_reference_now_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.training_reference_now_v1() IS
  'Real SQL request timestamp, with a transaction-local test-only override for deterministic temporal evidence.';

-- These functions already contain the authoritative production boundaries.
-- Reinstall their current definitions with only their wall-clock reads routed
-- through the shared seam, avoiding a second scheduler implementation or a
-- public test-only overload.
DO $clock_seam$
DECLARE
  function_oid regprocedure;
  function_definition text;
BEGIN
  function_oid := to_regprocedure(
    'fsrs6_compute(numeric,numeric,timestamp with time zone,smallint,numeric,integer,integer,numeric[])'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing fsrs6_compute';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing training_scheduler_candidates_v2';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'clock_timestamp()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'private.training_filter_target_date(jsonb)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing training_filter_target_date';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'now()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;

  function_oid := to_regprocedure(
    'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)'
  );
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'clock-seam: missing get_training_session_plan';
  END IF;
  function_definition := replace(
    pg_get_functiondef(function_oid),
    'clock_timestamp()',
    'private.training_reference_now_v1()'
  );
  EXECUTE function_definition;
END
$clock_seam$;

COMMIT;
