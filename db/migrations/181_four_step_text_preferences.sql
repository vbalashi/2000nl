-- Retain existing account/device size IDs and extend the ordered scale by one step.
-- No data rewrite, learning-state change or new preference owner.
BEGIN;
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_reading_size_phone_check,
  DROP CONSTRAINT IF EXISTS user_settings_reading_size_desktop_check;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_reading_size_phone_check
    CHECK (reading_size_phone IN ('normal', 'large', 'largest', 'extra')),
  ADD CONSTRAINT user_settings_reading_size_desktop_check
    CHECK (reading_size_desktop IN ('normal', 'large', 'largest', 'extra'));
COMMENT ON COLUMN public.user_settings.reading_size_phone IS
  'Account phone text profile: normal, large, largest, extra. Shared card/interface scale.';
COMMENT ON COLUMN public.user_settings.reading_size_desktop IS
  'Account computer/tablet text profile: normal, large, largest, extra. Shared card/interface scale.';
COMMIT;
