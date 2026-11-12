ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS training_show_question_on_answer boolean NOT NULL DEFAULT true;
