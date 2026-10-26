\i db/deploy-contract/read-only-postflight-226.sql
DO $postflight$
DECLARE
  config text[];
BEGIN
  SELECT proconfig INTO config
  FROM pg_proc
  WHERE oid = 'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure;

  IF config IS NULL OR NOT (config @> ARRAY['enable_nestloop=off']) THEN
    RAISE EXCEPTION 'training scheduler is missing its scoped enable_nestloop=off planner setting';
  END IF;
END;
$postflight$;
