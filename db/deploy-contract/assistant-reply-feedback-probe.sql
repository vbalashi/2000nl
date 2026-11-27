DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assistant_reply_feedback'::regclass)
      OR has_table_privilege('anon', 'public.assistant_reply_feedback', 'SELECT,INSERT,UPDATE')
      OR has_table_privilege('authenticated', 'public.assistant_reply_feedback', 'SELECT,INSERT,UPDATE')
      OR NOT has_table_privilege('service_role', 'public.assistant_reply_feedback', 'SELECT')
      OR NOT has_table_privilege('service_role', 'public.assistant_reply_feedback', 'INSERT')
      OR NOT has_table_privilege('service_role', 'public.assistant_reply_feedback', 'UPDATE') THEN
    RAISE EXCEPTION 'assistant_reply_feedback has unexpected data access';
  END IF;
END $$;
