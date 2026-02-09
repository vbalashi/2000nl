-- Add flexible JSON preferences field to user_settings
-- This allows adding new user preferences without schema migrations
-- Generated: 2026-01-24

-- Add preferences column
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

-- Create index for JSONB queries (optional, for performance)
CREATE INDEX IF NOT EXISTS user_settings_preferences_idx
    ON public.user_settings USING gin(preferences);

-- Example preferences structure:
-- {
--   "onboarding_completed": true,
--   "onboarding_language": "nl"
-- }

COMMENT ON COLUMN public.user_settings.preferences IS
'Flexible JSON field for user preferences. Allows adding new settings without schema migrations. Examples: onboarding_completed, onboarding_language, etc.';
