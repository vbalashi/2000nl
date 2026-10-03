\i db/deploy-contract/read-only-postflight-205.sql

DO $admin_user_registry_dual_identity_206$
DECLARE
  definition text := pg_get_functiondef('public.admin_user_registry_page(text,uuid,integer,integer)'::regprocedure);
BEGIN
  IF position('public.user_settings AS learner_profile' IN definition) = 0
     OR position('learner_profile.user_id = account.id' IN definition) = 0 THEN
    RAISE EXCEPTION 'admin registry must retain dual learner/operator profiles';
  END IF;
END
$admin_user_registry_dual_identity_206$;
