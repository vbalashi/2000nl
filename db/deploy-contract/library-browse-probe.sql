DO $probe$
DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'private.lookup_platform_v2_library_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)',
 'private.lookup_platform_v2_library_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'
 ] LOOP
 definition := pg_get_functiondef(signature::regprocedure);
 IF strpos(definition,'AND (v_raw_query IS NULL OR document.normalized_headword = v_query)')=0
 OR strpos(definition,'v_raw_query IS NULL OR lower(entry.headword) = lower(v_raw_query)')=0
 OR strpos(definition,'CASE WHEN v_raw_query IS NULL THEN 0 ELSE dictionary.dictionary_rank END AS dictionary_rank')=0
 OR strpos(definition,'    IF v_raw_query IS NULL THEN')>0 THEN
 RAISE EXCEPTION 'Library browse contract missing: %',signature;
 END IF;
 IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') THEN
 RAISE EXCEPTION 'Private Library base exposed: %',signature;
 END IF;
 END LOOP;
END;
$probe$;
