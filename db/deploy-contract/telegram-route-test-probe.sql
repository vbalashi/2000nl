DO $probe$
DECLARE
  authorization regprocedure := 'public.admin_notification_authorize_route_test_v1(uuid,uuid,uuid,integer,text)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=authorization AND prosecdef)
    OR has_function_privilege('anon',authorization,'EXECUTE')
    OR has_function_privilege('authenticated',authorization,'EXECUTE')
    OR NOT has_function_privilege('service_role',authorization,'EXECUTE')
  THEN
    RAISE EXCEPTION 'Telegram route test function privileges differ from DB393';
  END IF;
END;
$probe$;
