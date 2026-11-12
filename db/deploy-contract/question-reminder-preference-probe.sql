DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_settings' AND column_name='training_show_question_on_answer' AND data_type='boolean' AND is_nullable='NO' AND column_default='true') THEN
    RAISE EXCEPTION 'training question reminder preference missing or invalid';
  END IF;
END $$;
