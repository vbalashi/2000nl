\i db/deploy-contract/read-only-postflight-225.sql
DO $secondary_translation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings'
      AND column_name = 'secondary_translation_lang' AND data_type = 'text'
      AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN RAISE EXCEPTION 'secondary full-card translation preference contract mismatch'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_settings'::regclass)
  THEN RAISE EXCEPTION 'user_settings must retain RLS'; END IF;
END $secondary_translation$;
