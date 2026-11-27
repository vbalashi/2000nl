BEGIN;

CREATE TABLE public.assistant_reply_feedback (
  reply_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journey text NOT NULL CHECK (journey IN ('search', 'draft')),
  language_code text NOT NULL CHECK (length(language_code) BETWEEN 2 AND 20),
  vote text NOT NULL CHECK (vote IN ('up', 'down')),
  reason text CHECK (reason IN ('wrongMeaning', 'unrelated', 'notFound', 'example', 'save')),
  comment text CHECK (length(comment) BETWEEN 1 AND 1000),
  excerpt_question text CHECK (length(excerpt_question) BETWEEN 1 AND 1500),
  excerpt_answer text CHECK (length(excerpt_answer) BETWEEN 1 AND 6000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((excerpt_question IS NULL) = (excerpt_answer IS NULL)),
  CHECK (vote = 'down' OR (reason IS NULL AND comment IS NULL AND excerpt_question IS NULL))
);

ALTER TABLE public.assistant_reply_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_reply_feedback FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.assistant_reply_feedback TO service_role;

COMMIT;
