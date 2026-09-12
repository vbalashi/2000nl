-- Migration 145 repairs the finite-session starter after the private v1
-- candidate relation was retired. Assert the stored function body points at
-- the canonical v2 relation and cannot silently regress to v1.
\i db/deploy-contract/postflight-144.sql

DO $postflight_finite_session_scheduler_dependency$
DECLARE
  start_session_definition text;
BEGIN
  start_session_definition := pg_get_functiondef(
    'public.start_training_session(uuid,text[],uuid,text,text,jsonb,text)'::regprocedure
  );

  IF position('private.training_scheduler_candidates_v2(' IN start_session_definition) = 0
     OR position('private.training_scheduler_candidates_v1(' IN start_session_definition) <> 0 THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed finite-session-canonical-scheduler';
  END IF;
END
$postflight_finite_session_scheduler_dependency$;
