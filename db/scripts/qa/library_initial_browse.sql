-- Populated local QA regression. Temporary ACL/preferences changes are rolled back.
BEGIN;
DO $$
<<library_initial_browse>>
DECLARE
 owner uuid := (SELECT user_id FROM public.user_settings LIMIT 1);
 dictionary_id uuid;
 scoped_page jsonb;
 first_page jsonb;
 next_page jsonb;
 filtered jsonb;
 empty_scope jsonb;
 query_page jsonb;
 filters jsonb := '{"parts":[],"article":null}'::jsonb;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Requires populated local QA user'; END IF;
 first_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',NULL,NULL,10,50,filters);
 IF first_page ? 'error' OR jsonb_array_length(first_page->'items')=0
   OR (first_page->'page'->>'totalGroups')::integer<=10
   OR first_page->'page'->>'nextGroupCursor' IS NULL THEN
   RAISE EXCEPTION 'Initial browsing page/count/cursor failed'; END IF;
 next_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',NULL,first_page->'page'->>'nextGroupCursor',10,50,filters);
 IF next_page ? 'error' OR jsonb_array_length(next_page->'items')=0 THEN RAISE EXCEPTION 'Next page failed'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(first_page->'items') a
   JOIN jsonb_array_elements(next_page->'items') b ON a->>'id'=b->>'id') THEN
   RAISE EXCEPTION 'Duplicate entries across pages'; END IF;
 IF (SELECT max(public.normalize_dictionary_search_text(a->>'headword')) FROM jsonb_array_elements(first_page->'items') a)
    > (SELECT min(public.normalize_dictionary_search_text(a->>'headword')) FROM jsonb_array_elements(next_page->'items') a) THEN
   RAISE EXCEPTION 'Browse pages not alphabetical'; END IF;
 filtered := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',NULL,NULL,10,50,'{"parts":["noun"],"article":"het"}'::jsonb);
 IF filtered ? 'error' OR (filtered->'page'->>'totalGroups')::integer<=0
    OR (filtered->'page'->>'totalGroups')::integer >= (first_page->'page'->>'totalGroups')::integer THEN
   RAISE EXCEPTION 'Filters did not constrain browse count'; END IF;
 empty_scope := public.lookup_platform_v2_library_filtered_entries(owner,'','nl','{}'::uuid[],NULL,10,50,filters);
 IF empty_scope ? 'error' OR jsonb_array_length(empty_scope->'items')<>0
    OR (empty_scope->'page'->>'totalGroups')::integer<>0 THEN RAISE EXCEPTION 'Empty source scope widened'; END IF;
 query_page := public.lookup_platform_v2_entries(owner,false,'','nl');
 IF jsonb_array_length(query_page->'items')<>0 THEN RAISE EXCEPTION 'Platform empty lookup widened'; END IF;
 query_page := public.lookup_platform_v2_library_filtered_entries(owner,'goed','nl',NULL,NULL,10,50,filters);
 IF query_page ? 'error' OR jsonb_array_length(query_page->'items')=0 THEN RAISE EXCEPTION 'Existing query lookup failed'; END IF;
 IF has_function_privilege('authenticated','public.lookup_platform_v2_library_filtered_entries(uuid,text,text,uuid[],text,integer,integer,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'Browser role gained direct RPC execution'; END IF;
 -- Cursors are bound to filters and source scope, including empty-query browsing.
 query_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',NULL,first_page->'page'->>'nextGroupCursor',10,50,'{"parts":["noun"],"article":"het"}'::jsonb);
 IF query_page->>'error' IS DISTINCT FROM 'invalid_cursor' THEN RAISE EXCEPTION 'Filter cursor scope widened'; END IF;
 dictionary_id := (first_page->'items'->0->>'dictionary_id')::uuid;
 scoped_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',ARRAY[dictionary_id],NULL,10,50,filters);
 IF scoped_page ? 'error' OR jsonb_array_length(scoped_page->'items')=0 THEN RAISE EXCEPTION 'Scoped fixture has no entries'; END IF;
 query_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',ARRAY[dictionary_id],first_page->'page'->>'nextGroupCursor',10,50,filters);
 IF query_page->>'error' IS DISTINCT FROM 'invalid_cursor' THEN RAISE EXCEPTION 'Source cursor scope widened'; END IF;
 UPDATE public.user_settings SET material_preferences=jsonb_build_object('schemaVersion',1,'learningLanguages','[]'::jsonb,'disabledDictionaryIds',jsonb_build_array(dictionary_id::text)) WHERE user_id=owner;
 query_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',ARRAY[dictionary_id],NULL,10,50,filters);
 IF query_page ? 'error' OR jsonb_array_length(query_page->'items')<>0 THEN RAISE EXCEPTION 'Disabled dictionary visible in browse'; END IF;
 UPDATE public.user_settings SET material_preferences='{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":true},{"code":"en","paused":false}],"disabledDictionaryIds":[]}'::jsonb WHERE user_id=owner;
 query_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',NULL,NULL,10,50,filters);
 IF query_page ? 'error' OR jsonb_array_length(query_page->'items')<>0 THEN RAISE EXCEPTION 'Paused language visible in browse'; END IF;
 UPDATE public.user_settings SET material_preferences='{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}'::jsonb WHERE user_id=owner;
 UPDATE public.dictionaries SET visibility='private',owner_user_id=NULL WHERE id=dictionary_id;
 DELETE FROM public.dictionary_entitlements WHERE dictionary_entitlements.dictionary_id=library_initial_browse.dictionary_id;
 query_page := public.lookup_platform_v2_library_filtered_entries(owner,'','nl',ARRAY[dictionary_id],NULL,10,50,filters);
 IF query_page ? 'error' OR jsonb_array_length(query_page->'items')<>0 THEN RAISE EXCEPTION 'Unreadable dictionary visible in browse'; END IF;
 RAISE NOTICE 'Browse smoke passed: % total groups; filters, pages, scope and legacy lookup preserved',first_page->'page'->>'totalGroups';
END;
$$;
ROLLBACK;
