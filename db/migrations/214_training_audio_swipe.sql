-- Account-wide opt-in for the short upward audio gesture.
BEGIN;
ALTER TABLE public.user_settings
 ADD COLUMN training_audio_swipe_enabled boolean NOT NULL DEFAULT false;
COMMIT;
