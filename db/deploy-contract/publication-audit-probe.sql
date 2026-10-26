DO $publication_audit_203$
DECLARE
  signature text;
  signature_oid oid;
  definition text;
  signatures text[] := ARRAY[
    'public.admin_set_dictionary_publication(uuid,text,text[],uuid[],uuid,uuid,inet,text)',
    'public.admin_replace_dictionary_audience(uuid,text[],uuid[],uuid,uuid,inet,text)',
    'public.admin_replace_dictionary_access_group(text,text,uuid[],uuid,uuid,inet,text)'
  ];
BEGIN
  IF to_regprocedure('public.get_available_word_lists(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'collection source-availability projection is missing';
  END IF;

  definition := pg_get_functiondef(to_regprocedure('public.get_available_word_lists(uuid,text,text)'));
  IF position('can_browse_dictionary' IN definition) = 0
     OR position('unavailable_source_count' IN definition) = 0 THEN
    RAISE EXCEPTION 'collection availability projection does not use the browse policy';
  END IF;

  FOREACH signature IN ARRAY signatures LOOP
    signature_oid := to_regprocedure(signature);
    IF signature_oid IS NULL
       OR has_function_privilege('authenticated', signature_oid, 'EXECUTE')
       OR has_function_privilege('anon', signature_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', signature_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'atomic publication audit wrapper grants are invalid for %', signature;
    END IF;
    definition := pg_get_functiondef(signature_oid);
    IF position('publication.manage' IN definition) = 0
       OR position('admin_audit_events' IN definition) = 0 THEN
      RAISE EXCEPTION 'publication audit wrapper is missing permission or audit enforcement: %', signature;
    END IF;
  END LOOP;
END
$publication_audit_203$;
