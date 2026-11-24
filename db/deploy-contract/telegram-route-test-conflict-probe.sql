DO $probe$
DECLARE
  target_function regprocedure := 'public.admin_notification_authorize_route_test_v1(uuid,uuid,uuid,integer,text)'::regprocedure;
BEGIN
  IF strpos(pg_get_functiondef(target_function), 'ERRCODE=''PT409''') = 0 THEN
    RAISE EXCEPTION 'Telegram route test must return a terminal HTTP conflict';
  END IF;
END;
$probe$;
