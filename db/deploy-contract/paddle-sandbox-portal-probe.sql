DO $$
DECLARE
  wrapper regprocedure := 'public.read_paddle_sandbox_access()'::regprocedure;
  resolver regprocedure := to_regprocedure('private.paddle_sandbox_access_v1(uuid)');
  body text := pg_get_functiondef(wrapper);
BEGIN
  IF NOT has_function_privilege('authenticated', wrapper, 'EXECUTE')
    OR has_function_privilege('anon', wrapper, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Owned Paddle subscription projection unavailable';
  END IF;
  IF resolver IS NULL THEN
    IF position('subscriptionId' IN body) = 0 THEN
      RAISE EXCEPTION 'Owned Paddle subscription projection unavailable';
    END IF;
  ELSIF body !~ 'private[.]paddle_sandbox_access_v1[(][(]SELECT auth[.]uid[(][)][)][)]'
    OR position('subscriptionId' IN pg_get_functiondef(resolver)) = 0
    OR pg_get_functiondef(resolver) !~ 'attempt[.]user_id = p_user'
    OR has_function_privilege('authenticated', resolver, 'EXECUTE')
    OR has_function_privilege('anon', resolver, 'EXECUTE') THEN
    RAISE EXCEPTION 'Owned Paddle subscription resolver unavailable';
  END IF;
END
$$;
