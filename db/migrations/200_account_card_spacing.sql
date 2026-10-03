-- Presentation preference only. Existing user_settings ownership policies apply.
BEGIN;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS card_spacing text NOT NULL DEFAULT 'balanced';
ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_card_spacing_check CHECK (card_spacing IN ('balanced','airy'));
COMMIT;
