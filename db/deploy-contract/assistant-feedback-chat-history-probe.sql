DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assistant_reply_feedback'::regclass
      AND conname = 'assistant_feedback_chat_history_check'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'assistant feedback chat history constraint missing';
  END IF;
END $$;
