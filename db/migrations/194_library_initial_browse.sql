-- First-party Library browsing only. Platform lookup retains its query requirement.
BEGIN;
DO $browse$
DECLARE
 signature text;
 definition text;
 before_text text;
 start_at integer;
 end_at integer;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
   'private.lookup_platform_v2_library_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)',
   'private.lookup_platform_v2_library_filtered_entries_base_v1(uuid,boolean,text,text,text,integer,integer,jsonb)'
 ] LOOP
   definition := pg_get_functiondef(signature::regprocedure);
   -- Allow the empty-query candidate path instead of returning an empty page.
   start_at := strpos(definition,'    IF v_raw_query IS NULL THEN');
   end_at := strpos(definition,'    v_query := normalize_dictionary_search_text(v_raw_query);');
   IF start_at=0 AND strpos(definition,'AND (v_raw_query IS NULL OR document.normalized_headword = v_query)')>0 THEN
     CONTINUE; -- Already applied to this Library base.
   END IF;
   IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Library browse guard anchor changed: %',signature; END IF;
   definition := substr(definition,1,start_at-1) || substr(definition,end_at);
   before_text := 'AND document.normalized_headword = v_query';
   IF (length(definition)-length(replace(definition,before_text,'')))/length(before_text)<>1 THEN
     RAISE EXCEPTION 'Library browse indexed anchor changed: %',signature; END IF;
   definition := replace(definition,before_text,'AND (v_raw_query IS NULL OR document.normalized_headword = v_query)');
   before_text := '              lower(entry.headword) = lower(v_raw_query)';
   IF (length(definition)-length(replace(definition,before_text,'')))/length(before_text)<>1 THEN
     RAISE EXCEPTION 'Library browse personal anchor changed: %',signature; END IF;
   definition := replace(definition,before_text,'              v_raw_query IS NULL OR lower(entry.headword) = lower(v_raw_query)');
   -- Browsing is alphabetic across sources; query ranking stays unchanged.
   before_text := '            dictionary.dictionary_rank,';
   IF strpos(definition,before_text)=0 THEN RAISE EXCEPTION 'Library browse ordering anchor changed: %',signature; END IF;
   definition := replace(definition,before_text,'            CASE WHEN v_raw_query IS NULL THEN 0 ELSE dictionary.dictionary_rank END AS dictionary_rank,');
   EXECUTE definition;
 END LOOP;
END;
$browse$;
-- CREATE OR REPLACE retains existing restricted privileges and ACL-bearing wrappers.
COMMIT;
