-- Read-only smoke on the populated local QA database; runs inside a rollback.
BEGIN;
DO $$
DECLARE
 owner uuid := (SELECT user_id FROM public.user_settings LIMIT 1);
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
 RAISE NOTICE 'Browse smoke passed: % total groups; filters, pages, scope and legacy lookup preserved',first_page->'page'->>'totalGroups';
END;
$$;
ROLLBACK;
