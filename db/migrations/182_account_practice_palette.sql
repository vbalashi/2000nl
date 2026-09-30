-- Palette shares the existing account settings and own-row policies.
BEGIN;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS practice_palette text NOT NULL DEFAULT 'lavender';
DO $palette$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass AND conname='user_settings_practice_palette_check') THEN
  ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_practice_palette_check CHECK (practice_palette IN ('lavender','blue','graphite'));
 END IF;
END;
$palette$;
COMMIT;
