DO $owned_validator_privacy$
BEGIN
 IF has_function_privilege('anon','public.validate_user_entry_v1_payload(jsonb,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.validate_user_entry_v1_payload(jsonb,text)','EXECUTE')
 OR has_function_privilege('service_role','public.validate_user_entry_v1_payload(jsonb,text)','EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: owned entry validator exposed as direct RPC';
 END IF;
END;
$owned_validator_privacy$;
