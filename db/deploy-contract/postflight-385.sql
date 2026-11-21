\i db/deploy-contract/postflight-384.sql
DO $$ BEGIN
 IF NOT has_function_privilege('service_role','public.admin_archive_notification_bot_v1(uuid,uuid,uuid,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.admin_archive_notification_bot_v1(uuid,uuid,uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Invalid notification bot archive access'; END IF;
END $$;
