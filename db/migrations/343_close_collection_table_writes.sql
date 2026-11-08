BEGIN;
-- User-facing composition writes must pass the authenticated, server-bound
-- confirmation RPCs. RLS alone cannot distinguish an unconfirmed owner write.
-- SECURITY DEFINER application routines retain their existing table authority.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
 ON public.user_word_lists, public.user_word_list_items FROM anon, authenticated;
COMMIT;
