\i db/deploy-contract/read-only-postflight-221.sql
DO $progress_contract$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
 AND table_name='user_settings' AND column_name='training_progress_animation'
 AND data_type='text' AND is_nullable='NO' AND column_default='''dots''::text')
 THEN RAISE EXCEPTION 'training progress preference column missing or invalid'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass
 AND conname='user_settings_training_progress_animation_check' AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%off%dots%wave%')
 THEN RAISE EXCEPTION 'training progress preference check missing'; END IF;
END;
$progress_contract$;
