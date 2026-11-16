DO $$
DECLARE signature text; relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['operator_notification_settings','operator_notification_events','operator_notification_bots','operator_notification_routes','operator_notification_deliveries'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('private.'||relation) AND relrowsecurity) THEN RAISE EXCEPTION 'notification_rls_missing'; END IF;
  IF has_table_privilege('anon','private.'||relation,'select,insert,update,delete') OR has_table_privilege('authenticated','private.'||relation,'select,insert,update,delete') OR has_table_privilege('service_role','private.'||relation,'select,insert,update,delete') THEN RAISE EXCEPTION 'notification_table_exposed'; END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['public.admin_notification_enabled_v1(uuid,uuid,boolean)','public.operator_delivery_claim_v1(integer)','public.operator_delivery_settle_v1(uuid,uuid,text,integer)','public.admin_notification_configuration_v1(uuid,uuid)','public.admin_notification_create_bot_v1(uuid,uuid,text)','public.admin_notification_begin_secret_v1(uuid,uuid,uuid,integer)','public.admin_notification_finish_secret_v1(uuid,uuid,uuid,uuid,text)','public.admin_notification_save_route_v1(uuid,uuid,uuid,integer,uuid,text,text,bigint,boolean)','public.operator_delivery_decide_v1(uuid,uuid,text,text,bigint,uuid,text,uuid)'] LOOP
  IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'notification_function_missing'; END IF;
  IF has_function_privilege('anon',signature,'execute') OR has_function_privilege('authenticated',signature,'execute') OR NOT has_function_privilege('service_role',signature,'execute') THEN RAISE EXCEPTION 'notification_function_acl_invalid'; END IF;
 END LOOP;
END $$;
