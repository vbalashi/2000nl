-- Additive account preference; older app versions ignore this column.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS training_always_show_card_count boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
