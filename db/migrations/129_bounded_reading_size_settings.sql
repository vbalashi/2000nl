-- Bounded per-profile reading-size preferences for the first-party UI.

BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS reading_size_phone text DEFAULT 'normal';

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS reading_size_desktop text DEFAULT 'normal';

-- Keep rows created before this additive migration compatible with the new
-- contract without changing any unrelated preferences.
UPDATE public.user_settings
SET reading_size_phone = 'normal'
WHERE reading_size_phone IS NULL;

UPDATE public.user_settings
SET reading_size_desktop = 'normal'
WHERE reading_size_desktop IS NULL;

ALTER TABLE public.user_settings
  ALTER COLUMN reading_size_phone SET DEFAULT 'normal',
  ALTER COLUMN reading_size_phone SET NOT NULL,
  ALTER COLUMN reading_size_desktop SET DEFAULT 'normal',
  ALTER COLUMN reading_size_desktop SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_settings'::regclass
      AND conname = 'user_settings_reading_size_phone_check'
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_reading_size_phone_check
      CHECK (reading_size_phone IN ('normal', 'large', 'largest'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_settings'::regclass
      AND conname = 'user_settings_reading_size_desktop_check'
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_reading_size_desktop_check
      CHECK (reading_size_desktop IN ('normal', 'large', 'largest'));
  END IF;
END;
$$;

COMMIT;
