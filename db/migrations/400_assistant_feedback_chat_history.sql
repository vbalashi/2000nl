BEGIN;

ALTER TABLE public.assistant_reply_feedback
  ADD COLUMN chat_history jsonb,
  ADD CONSTRAINT assistant_feedback_chat_history_check CHECK (
    CASE
      WHEN chat_history IS NULL THEN true
      WHEN jsonb_typeof(chat_history) <> 'array' THEN false
      ELSE vote = 'down'
        AND excerpt_question IS NULL
        AND jsonb_array_length(chat_history) BETWEEN 1 AND 8
    END
  );

COMMIT;
