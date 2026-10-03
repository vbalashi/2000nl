BEGIN READ ONLY;
DO $indigo$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_settings'::regclass
      AND conname = 'user_settings_practice_palette_check'
      AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%''indigo''%'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: Indigo account palette constraint missing';
  END IF;
END;
$indigo$;
COMMIT;
