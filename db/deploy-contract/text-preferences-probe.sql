BEGIN READ ONLY;
DO $text_preferences$
DECLARE v_column text;
BEGIN
  FOREACH v_column IN ARRAY ARRAY['reading_size_phone','reading_size_desktop'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass
      AND attname=v_column AND attnotnull AND NOT attisdropped) THEN
      RAISE EXCEPTION 'db-contract-gate: text profile column missing: %', v_column;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass
      AND conname='user_settings_'||v_column||'_check' AND contype='c' AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%''normal''%'
      AND pg_get_constraintdef(oid) LIKE '%''large''%'
      AND pg_get_constraintdef(oid) LIKE '%''largest''%'
      AND pg_get_constraintdef(oid) LIKE '%''extra''%') THEN
      RAISE EXCEPTION 'db-contract-gate: four-step text profile constraint missing: %', v_column;
    END IF;
  END LOOP;
END;
$text_preferences$;
COMMIT;
