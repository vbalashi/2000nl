-- Account-wide appearance and optional gestures. Existing user_settings RLS owns access.
BEGIN;
ALTER TABLE public.user_settings
 ADD COLUMN training_animation_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN training_grade_swipe_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN training_translation_swipe_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN training_syllable_double_tap_enabled boolean NOT NULL DEFAULT false;
COMMIT;
