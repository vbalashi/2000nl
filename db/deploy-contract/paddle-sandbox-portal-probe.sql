DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.read_paddle_sandbox_access()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.read_paddle_sandbox_access()', 'EXECUTE')
    OR position('subscriptionId' IN pg_get_functiondef('public.read_paddle_sandbox_access()'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'Owned Paddle subscription projection unavailable';
  END IF;
END
$$;
