BEGIN READ ONLY;
DO $palette$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass AND attname='practice_palette' AND attnotnull AND NOT attisdropped) THEN
  RAISE EXCEPTION 'db-contract-gate: account palette column missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass AND conname='user_settings_practice_palette_check' AND convalidated AND pg_get_constraintdef(oid) LIKE '%''lavender''%' AND pg_get_constraintdef(oid) LIKE '%''blue''%' AND pg_get_constraintdef(oid) LIKE '%''graphite''%') THEN
  RAISE EXCEPTION 'db-contract-gate: account palette constraint missing';
 END IF;
END;
$palette$;
COMMIT;
