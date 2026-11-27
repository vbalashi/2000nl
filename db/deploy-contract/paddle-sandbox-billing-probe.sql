DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_class
    WHERE oid = 'private.paddle_sandbox_attempts'::regclass AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT FROM pg_catalog.pg_class
    WHERE oid = 'private.paddle_sandbox_events'::regclass AND relrowsecurity
  ) OR has_table_privilege('authenticated', 'private.paddle_sandbox_events', 'SELECT')
    OR has_function_privilege('anon', 'public.read_paddle_sandbox_access()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.record_paddle_sandbox_event(jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.register_paddle_sandbox_attempt(text,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.read_paddle_sandbox_access()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.record_paddle_sandbox_event(jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.register_paddle_sandbox_attempt(text,uuid,text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Paddle Sandbox billing schema or admission grants differ';
  END IF;
END
$$;
