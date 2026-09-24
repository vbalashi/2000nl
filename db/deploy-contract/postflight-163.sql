-- Preserve the existing exercise boundary and verify that the shared source
-- gate resolves a target's small active group instead of scanning all words.
\i db/deploy-contract/postflight-162.sql

BEGIN;
DO $postflight_bounded_extra_eligibility$
DECLARE
  v_function_oid oid :=
    'private.platform_v2_training_ordinary_meaning_eligible_v1(uuid,uuid)'::regprocedure;
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(v_function_oid) INTO v_definition;
  IF v_definition IS NULL
     OR v_definition NOT ILIKE '%target_source_group AS MATERIALIZED%'
     OR v_definition NOT ILIKE '%source_entry_bindings%'
     OR v_definition NOT ILIKE '%can_access_dictionary%'
     OR v_definition NOT ILIKE '%user_card_status%'
     OR v_definition NOT ILIKE '%user_card_known_marks%'
     OR to_regclass('private.source_entry_bindings_group_idx') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc AS fn
       WHERE fn.oid = v_function_oid
         AND fn.prosecdef
         AND fn.provolatile = 's'
         AND pg_get_userbyid(fn.proowner) = 'postgres'
         AND fn.proconfig @> ARRAY['search_path=public, private, pg_temp']
     )
     OR has_function_privilege('anon', v_function_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     OR has_function_privilege('service_role', v_function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'db-contract-gate: postflight-failed bounded-extra-eligibility';
  END IF;
END
$postflight_bounded_extra_eligibility$;
COMMIT;
