DO $$
DECLARE signature text;
BEGIN
 IF to_regclass('private.telegram_notification_targets') IS NULL
  OR to_regclass('private.telegram_notification_links') IS NULL
  OR to_regclass('private.operator_notification_deployment_once') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_attribute
    WHERE attrelid='private.operator_notification_events'::regclass AND attname='deployment_values' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'Telegram discovery and deployment notification tables are incomplete'; END IF;

 FOREACH signature IN ARRAY ARRAY[
  'public.admin_telegram_link_v1(uuid,uuid,uuid,text)',
  'public.admin_telegram_targets_v1(uuid)',
  'public.admin_telegram_topic_credential_v1(uuid,uuid,uuid,text)',
  'public.operator_telegram_target_event_v1(uuid,text,text,text,boolean,bigint,text,text,timestamptz,bigint,text,uuid)',
  'public.operator_enqueue_deployment_v1(text,text,jsonb)'
 ] LOOP
  IF NOT has_function_privilege('service_role',signature,'EXECUTE')
   OR has_function_privilege('authenticated',signature,'EXECUTE')
   OR has_function_privilege('anon',signature,'EXECUTE')
   THEN RAISE EXCEPTION 'Invalid Telegram RPC access for %',signature; END IF;
 END LOOP;
END $$;
