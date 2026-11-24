DO $probe$
DECLARE
  target_function regprocedure := 'public.admin_notification_authorize_route_test_v1(uuid,uuid,uuid,integer,text)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=target_function AND prosecdef)
    OR has_function_privilege('anon',target_function,'EXECUTE')
    OR has_function_privilege('authenticated',target_function,'EXECUTE')
    OR NOT has_function_privilege('service_role',target_function,'EXECUTE')
  THEN
    RAISE EXCEPTION 'Telegram route test function privileges differ from DB393';
  END IF;
END;
$probe$;
