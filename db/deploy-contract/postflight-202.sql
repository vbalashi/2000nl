\i db/deploy-contract/postflight-201.sql

DO $publication_rpc_202$
DECLARE
  lookup_definition text;
  library_definition text;
BEGIN
  IF to_regprocedure('public.can_browse_dictionary(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.set_dictionary_publication(uuid,text,text[],uuid[])') IS NULL
     OR to_regprocedure('public.replace_dictionary_access_group(text,text,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'publication access RPC contract is incomplete';
  END IF;

  IF has_function_privilege('authenticated', 'public.set_dictionary_publication(uuid,text,text[],uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_dictionary_publication(uuid,text,text[],uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.set_dictionary_publication(uuid,text,text[],uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'publication mutation RPC grants are too broad or missing';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'private.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)'
  )) INTO lookup_definition;
  IF lookup_definition IS NULL OR position('can_browse_dictionary(p_user_id, dictionary.id)' IN lookup_definition) = 0 THEN
    RAISE EXCEPTION 'Platform V2 dictionary lookup does not use browse authorization';
  END IF;

  SELECT pg_get_functiondef(to_regprocedure(
    'private.lookup_platform_v2_library_browse_entries_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'
  )) INTO library_definition;
  IF library_definition IS NULL
     OR position('public.can_browse_dictionary(p_user_id, dictionary.id)' IN library_definition) = 0 THEN
    RAISE EXCEPTION 'bounded Library browse does not use browse authorization';
  END IF;
END
$publication_rpc_202$;
