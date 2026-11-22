DO $$
BEGIN
 IF to_regclass('private.operator_notification_template_versions') IS NULL
  OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='private.operator_notification_deliveries'::regclass
   AND attname='template_version' AND NOT attisdropped)
  OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='private.operator_notification_deliveries'::regclass
   AND tgname='pin_operator_notification_template' AND tgenabled='O')
  OR position('templateBody' in pg_get_functiondef(COALESCE(
    to_regprocedure('private.operator_claim_notification_deliveries(integer,boolean)'),
    'public.operator_delivery_claim_v1(integer)'::regprocedure)))=0
  OR NOT has_function_privilege('service_role','public.admin_notification_templates_v1(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.admin_notification_publish_template_v1(uuid,uuid,text,text,bigint)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.admin_notification_authorize_test_v1(uuid,uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.admin_notification_authorize_test_v1(uuid,uuid,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'DB379 notification templates contract is incomplete';
 END IF;
END $$;
