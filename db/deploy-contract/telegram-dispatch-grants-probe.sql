DO $$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.operator_telegram_delivery_claim_v1(integer)',
   'public.operator_telegram_notification_status_v1()','public.operator_telegram_notification_cleanup_v1()'] LOOP
  IF NOT has_function_privilege('service_role',signature,'EXECUTE')
    OR has_function_privilege('anon',signature,'EXECUTE')
    OR has_function_privilege('authenticated',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'Unexpected Telegram dispatcher authority: %',signature;
  END IF;
 END LOOP;
 IF has_function_privilege('service_role','private.operator_claim_notification_deliveries(integer,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Internal notification claim must stay private';
 END IF;
END $$;
