-- Verify the interday FSRS reference alignment after migration 150.
\i db/deploy-contract/postflight-149.sql

BEGIN;

DO $postflight_fsrs_interday_reference$
DECLARE
  again_result jsonb;
  easy_result jsonb;
BEGIN
  again_result := public.fsrs6_compute(
    2.3065,
    2.118104,
    statement_timestamp() - interval '1 day',
    1::smallint,
    0.9,
    1,
    0,
    public.fsrs6_parameters()
  );
  IF (again_result->>'same_day')::boolean
     OR abs((again_result->>'stability')::numeric - 2.195161) > 0.000001
     OR abs((again_result->>'difficulty')::numeric - 7.394503) > 0.000001 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed fsrs-interday-again-reference';
  END IF;

  easy_result := public.fsrs6_compute(
    2.3065,
    2.118104,
    statement_timestamp() - interval '5 days',
    4::smallint,
    0.9,
    1,
    0,
    public.fsrs6_parameters()
  );
  IF (easy_result->>'same_day')::boolean
     OR abs((easy_result->>'stability')::numeric - 32.013223) > 0.000001
     OR abs((easy_result->>'difficulty')::numeric - 1) > 0.000001 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed fsrs-interday-easy-reference';
  END IF;
END
$postflight_fsrs_interday_reference$;

COMMIT;
