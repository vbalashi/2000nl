DO $probe$
BEGIN
  IF NOT private.library_entry_matches_filters_v1('afk',NULL,'{"parts":["abbreviation"],"article":null}'::jsonb)
    OR NOT private.library_entry_matches_filters_v1('vv',NULL,'{"parts":["prefix"],"article":null}'::jsonb)
    OR private.library_entry_matches_filters_v1('other',NULL,'{"parts":["prefix"],"article":null}'::jsonb) THEN
    RAISE EXCEPTION 'library_abbreviation_prefix_contract';
  END IF;
END;
$probe$;
