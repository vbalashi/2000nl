-- Supabase keeps pgcrypto in extensions; legacy RPCs have a fixed public/private
-- search path. Match the digest compatibility surface already used by plain
-- Postgres CI without moving an extension or rewriting any RPC body/grants.
BEGIN;
DO $pgcrypto_compatibility$
DECLARE
  crypto_schema text;
  input_type text;
BEGIN
  SELECT namespace.nspname INTO STRICT crypto_schema
  FROM pg_extension extension_state
  JOIN pg_namespace namespace ON namespace.oid = extension_state.extnamespace
  WHERE extension_state.extname = 'pgcrypto';

  -- A public installation already supplies these exact overloads.
  IF crypto_schema = 'public' THEN
    RETURN;
  END IF;

  FOREACH input_type IN ARRAY ARRAY['text', 'bytea'] LOOP
    IF to_regprocedure(format('public.digest(%s,text)', input_type)) IS NULL THEN
      EXECUTE format(
        'CREATE FUNCTION public.digest(data %s, type text) RETURNS bytea
         LANGUAGE sql IMMUTABLE PARALLEL SAFE
         SET search_path = pg_catalog
         AS %L',
        input_type,
        format('SELECT %I.digest(data, type)', crypto_schema)
      );
    END IF;
  END LOOP;
END;
$pgcrypto_compatibility$;
COMMIT;
