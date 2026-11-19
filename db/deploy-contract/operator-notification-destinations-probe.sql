DO $$
BEGIN
 IF to_regclass('private.operator_notification_test_destinations') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='private.operator_notification_routes'::regclass AND attname='chat_title' AND NOT attisdropped)
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='private.operator_notification_routes'::regclass AND attname='topic_title' AND NOT attisdropped)
  OR NOT has_function_privilege('service_role','public.admin_notification_configuration_v2(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.admin_notification_save_route_v2(uuid,uuid,uuid,integer,uuid,text,text,bigint,boolean,text,text)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.admin_notification_save_test_destination_v1(uuid,uuid,uuid,text,text,bigint)','EXECUTE')
  OR has_function_privilege('authenticated','public.admin_notification_save_test_destination_v1(uuid,uuid,uuid,text,text,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'DB380 notification destinations contract is incomplete';
 END IF;
END $$;
