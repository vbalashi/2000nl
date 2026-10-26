-- Keep the established contract checks and add the #279 FSRS parity guard.
\i db/deploy-contract/postflight-130.sql

BEGIN;

DO $postflight_fsrs_parity$
DECLARE
  fsrs_oid regprocedure := to_regprocedure(
    'public.fsrs6_compute(numeric,numeric,timestamptz,smallint,numeric,integer,integer,numeric[])'
  );
  definition text;
BEGIN
  IF fsrs_oid IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed fsrs-compute-signature';
  END IF;
  definition := upper(pg_get_functiondef(fsrs_oid));
  IF position('SHORT-TERM STABILITY UPDATE' IN definition) = 0
     OR position('GREATEST(P_STABILITY, NEW_STABILITY)' IN definition) = 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed fsrs-same-day-parity';
  END IF;
END;
$postflight_fsrs_parity$;

COMMIT;
