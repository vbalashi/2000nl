BEGIN READ ONLY;
DO $spacing$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass AND attname='card_spacing' AND attnotnull AND NOT attisdropped)
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass AND conname='user_settings_card_spacing_check' AND convalidated AND pg_get_constraintdef(oid) LIKE '%''balanced''%' AND pg_get_constraintdef(oid) LIKE '%''airy''%') THEN
 RAISE EXCEPTION 'db-contract-gate: account card spacing missing';
 END IF;
END;
$spacing$;
COMMIT;
