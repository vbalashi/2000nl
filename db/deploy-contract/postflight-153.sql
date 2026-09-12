-- Verify the one-active-run authority after migration 153.
\i db/deploy-contract/postflight-152.sql

BEGIN;

DO $postflight_active_training_run$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.training_active_runs') IS NULL THEN
    v_missing := v_missing || 'active-run-table';
  END IF;
  IF to_regclass('public.training_run_start_receipts') IS NULL THEN
    v_missing := v_missing || 'start-receipt-table';
  END IF;
  IF to_regprocedure('private.require_active_training_session_v1(uuid,uuid)') IS NULL THEN
    v_missing := v_missing || 'active-run-guard';
  END IF;
  IF to_regprocedure('public.start_training_session(uuid,text[],uuid,text,text,jsonb,text,uuid)') IS NULL THEN
    v_missing := v_missing || 'idempotent-start';
  END IF;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'db-contract-gate: postflight-failed active-training-run %',
      array_to_string(v_missing, ',');
  END IF;
  IF has_function_privilege(
    'authenticated',
    'private.require_active_training_session_v1(uuid,uuid)',
    'execute'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed active-training-run-guard-grant';
  END IF;
END
$postflight_active_training_run$;

COMMIT;
