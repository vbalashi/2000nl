-- Add preference to pin/hide training sidebar on desktop
-- Default: not pinned (hidden)

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS training_sidebar_pinned boolean DEFAULT false;

UPDATE public.user_settings
SET training_sidebar_pinned = false
WHERE training_sidebar_pinned IS NULL;

