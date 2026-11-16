DO $$
BEGIN
 IF has_column_privilege('authenticated','public.user_settings','subscription_tier','INSERT')
 OR has_column_privilege('authenticated','public.user_settings','subscription_tier','UPDATE')
 OR has_column_privilege('anon','public.user_settings','subscription_tier','INSERT')
 OR has_column_privilege('anon','public.user_settings','subscription_tier','UPDATE')
 OR has_table_privilege('authenticated','public.user_settings','TRUNCATE')
 OR has_table_privilege('authenticated','public.user_settings','DELETE') THEN
  RAISE EXCEPTION 'subscription_tier_client_writable'; END IF;
 IF NOT has_column_privilege('authenticated','public.user_settings','preferences','UPDATE')
 OR NOT has_column_privilege('authenticated','public.user_settings','user_id','INSERT') THEN
  RAISE EXCEPTION 'ordinary_settings_not_writable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_settings'::regclass AND tgname='subscription_tier_server_owned' AND tgenabled='O') THEN
  RAISE EXCEPTION 'subscription_tier_indirect_write_guard_missing'; END IF;
END $$;
