-- Last chosen headword display is shared across cards, sessions and devices.
BEGIN;
ALTER TABLE public.user_settings
 ADD COLUMN training_show_syllables boolean NOT NULL DEFAULT false;
COMMIT;
