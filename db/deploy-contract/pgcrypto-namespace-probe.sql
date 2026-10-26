BEGIN READ ONLY;
DO $pgcrypto_namespace_contract$
BEGIN
  IF encode(public.digest('abc'::text, 'sha256'), 'hex') <>
       'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
     OR public.digest('abc'::bytea, 'sha256') <>
        public.digest('abc'::text, 'sha256') THEN
    RAISE EXCEPTION 'db-contract-gate: pgcrypto public compatibility is invalid';
  END IF;
END;
$pgcrypto_namespace_contract$;
COMMIT;
