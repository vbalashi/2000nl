DO $$
DECLARE fn regprocedure := 'public.read_received_group_catalog_v1(text,text,uuid,text,jsonb,integer,text)'::regprocedure;
BEGIN
 IF NOT has_function_privilege('authenticated',fn,'EXECUTE')
  OR has_function_privilege('anon',fn,'EXECUTE')
  OR has_function_privilege('service_role',fn,'EXECUTE')
  OR (SELECT provolatile FROM pg_proc WHERE oid=fn)<>'s'
 THEN RAISE EXCEPTION 'DB381 received group tree contract is incomplete';
 END IF;
END $$;
