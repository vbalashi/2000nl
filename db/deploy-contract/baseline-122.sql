DO $baseline$
BEGIN
  IF to_regprocedure(
    'public.submit_diagnostic_report_as_principal(uuid,text,text,uuid,text,text,jsonb)'
  ) IS NULL OR to_regclass('public.diagnostic_report_receipts') IS NULL THEN
    RAISE EXCEPTION 'db-contract-gate: database is older than managed baseline 122';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.submit_diagnostic_report_as_principal(uuid,text,text,uuid,text,text,jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.submit_diagnostic_report_as_principal(uuid,text,text,uuid,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'db-contract-gate: baseline 122 grant contract is incompatible';
  END IF;
END
$baseline$;
