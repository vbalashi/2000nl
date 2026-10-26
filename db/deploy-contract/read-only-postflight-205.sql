\i db/deploy-contract/read-only-postflight-204.sql

DO $admin_user_registry_pagination_205$
DECLARE
  definition text := pg_get_functiondef('public.admin_user_registry_page(text,uuid,integer,integer)'::regprocedure);
BEGIN
  IF position('LIMIT (p_page_size + 1)' IN definition) = 0
     OR position('OFFSET (p_page - 1) * p_page_size' IN definition) = 0 THEN
    RAISE EXCEPTION 'admin registry pagination must offset by visible page size';
  END IF;
END
$admin_user_registry_pagination_205$;
