\i db/deploy-contract/postflight-385.sql
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='private.operator_notification_routes'::regclass
   AND tgname='cancel_disabled_telegram_route' AND tgenabled='O')
 THEN RAISE EXCEPTION 'Telegram route cancellation is unavailable'; END IF;
END $$;
