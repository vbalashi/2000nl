-- Presentation preference only. Existing user_settings ownership policies apply.
BEGIN;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS card_spacing text NOT NULL DEFAULT 'balanced';
DO $spacing$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass AND conname='user_settings_card_spacing_check') THEN
  ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_card_spacing_check CHECK (card_spacing IN ('balanced','airy'));
 END IF;
END;
$spacing$;
COMMIT;
