BEGIN;
ALTER TABLE public.user_settings
  ADD COLUMN training_progress_animation text NOT NULL DEFAULT 'dots'
  CONSTRAINT user_settings_training_progress_animation_check
  CHECK (training_progress_animation IN ('off', 'dots', 'wave'));
COMMIT;
