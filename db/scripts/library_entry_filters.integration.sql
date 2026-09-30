BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('40750000-0000-0000-0000-000000000001','library-material@example.test'),
 ('40750000-0000-0000-0000-000000000002','private-library@example.test');
INSERT INTO public.languages(code,name) VALUES('en','English') ON CONFLICT DO NOTHING;
INSERT INTO public.dictionaries(id,language_code,slug,name,kind,visibility,owner_user_id,is_editable) VALUES
 ('40751000-0000-0000-0000-000000000001','nl','library-scope-a','A','curated','public',NULL,false),
 ('40751000-0000-0000-0000-000000000002','nl','library-scope-b','B','curated','public',NULL,false),
 ('40751000-0000-0000-0000-000000000003','nl','library-personal','Personal','user','private','40750000-0000-0000-0000-000000000001',true),
 ('40751000-0000-0000-0000-000000000004','nl','library-other-personal','Other','user','private','40750000-0000-0000-0000-000000000002',true);
INSERT INTO public.word_entries(id,language_code,headword,meaning_id,dictionary_id,part_of_speech,raw)
SELECT ('40752000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'nl','scopeword',1,
 ('40751000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'zn',
 '{"meanings":[{"definition":"test definition"}]}' FROM generate_series(1,4) i;
INSERT INTO private.dictionary_import_runs(id,dictionary_id,identity_scheme_version,artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status)
SELECT ('40753000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 ('40751000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'test-v1','test-v1','test','test',1,1,'completed' FROM generate_series(1,2) i;
INSERT INTO private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
SELECT dictionary_id,'test-v1',id::text,'scopeword',1,id,'active',
 ('40753000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 ('40753000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'test','test-v1','test','{}','{}'
FROM public.word_entries CROSS JOIN generate_series(1,2) i
WHERE id=('40752000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid;
SELECT public.refresh_dictionary_search_document(id,2) FROM public.word_entries WHERE headword='scopeword';
-- A mixed article keeps all senses after its noun matches; the UI chooses the matching sense.
UPDATE public.word_entries SET part_of_speech='ww' WHERE dictionary_id='40751000-0000-0000-0000-000000000001';
UPDATE public.word_entries SET gender='het' WHERE dictionary_id='40751000-0000-0000-0000-000000000002';
UPDATE public.word_entries SET gender='de' WHERE dictionary_id='40751000-0000-0000-0000-000000000003';
INSERT INTO public.word_entries(id,language_code,headword,meaning_id,dictionary_id,part_of_speech,gender,raw)
VALUES('40752000-0000-0000-0000-000000000005','nl','scopeword',2,'40751000-0000-0000-0000-000000000001','zn','de/het','{"meanings":[{"definition":"second sense"}]}');
INSERT INTO private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
VALUES('40751000-0000-0000-0000-000000000001','test-v1','sense-two','scopeword',2,'40752000-0000-0000-0000-000000000005','active','40753000-0000-0000-0000-000000000001','40753000-0000-0000-0000-000000000001','test','test-v1','test','{}','{}');
SELECT public.refresh_dictionary_search_document(id,2) FROM public.word_entries WHERE headword='scopeword';
DO $$
DECLARE
 u uuid := '40750000-0000-0000-0000-000000000001';
 a uuid := '40751000-0000-0000-0000-000000000001';
 b uuid := '40751000-0000-0000-0000-000000000002';
 payload jsonb; next_payload jsonb; cursor text; baseline jsonb; invalid jsonb;
BEGIN
 baseline := public.lookup_platform_v2_library_entries(u,'scopeword','nl',NULL,NULL,10,50);
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',NULL,NULL,10,50,'{}');
 IF jsonb_set(payload,'{page}',(payload->'page')-'totalGroups')<>baseline THEN RAISE EXCEPTION 'unfiltered Library compatibility changed'; END IF;
 IF public.lookup_platform_v2_library_entries(u,'scopeword','nl',NULL,NULL,10,50)<>baseline THEN RAISE EXCEPTION 'existing Library RPC changed'; END IF;
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',ARRAY[a],NULL,1,50,'{"parts":["noun"],"article":"het"}');
 IF payload ? 'error' OR jsonb_array_length(payload->'items')<>2 OR payload#>>'{page,totalGroups}'<>'1'
   OR payload#>>'{page,nextGroupCursor}' IS NOT NULL THEN RAISE EXCEPTION 'whole mixed article lost: %',payload; END IF;
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',NULL,NULL,1,50,'{"parts":["noun"]}');
 IF payload ? 'error' OR payload#>>'{page,totalGroups}'<>'3' THEN RAISE EXCEPTION 'wrong pre-page group count: %',payload; END IF;
 cursor := payload#>>'{page,nextGroupCursor}';
 IF cursor IS NULL THEN RAISE EXCEPTION 'missing filtered cursor'; END IF;
 next_payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',NULL,cursor,1,50,'{"article":null,"parts":["noun","noun"]}');
 IF next_payload ? 'error' OR next_payload#>>'{page,totalGroups}'<>'3'
   OR next_payload#>>'{items,0,id}'=payload#>>'{items,0,id}' THEN RAISE EXCEPTION 'canonical filtered paging failed: %',next_payload; END IF;
 IF public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',NULL,cursor,1,50,'{"parts":["verb"]}')->>'error'<>'invalid_cursor' THEN RAISE EXCEPTION 'cursor crossed POS filter'; END IF;
 IF public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',NULL,cursor,1,50,'{"parts":["noun"],"article":"de"}')->>'error'<>'invalid_cursor' THEN RAISE EXCEPTION 'cursor crossed article filter'; END IF;
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',ARRAY[b],NULL,10,50,'{"parts":["noun"],"article":"de"}');
 IF jsonb_array_length(payload->'items')<>0 OR payload#>>'{page,totalGroups}'<>'0' THEN RAISE EXCEPTION 'article scope after page'; END IF;
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',ARRAY[a,b],NULL,10,50,'{"parts":["noun","verb"],"article":"de"}');
 IF payload#>>'{page,totalGroups}'<>'1' OR jsonb_array_length(payload->'items')<>2 THEN RAISE EXCEPTION 'non-noun removed by article: %',payload; END IF;
 -- Unknown gender cannot satisfy a selected article. All/no POS selection retains it.
 UPDATE public.word_entries SET gender=NULL WHERE dictionary_id=b;
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',ARRAY[b],NULL,10,50,'{"parts":["noun"],"article":"het"}');
 IF jsonb_array_length(payload->'items')<>0 THEN RAISE EXCEPTION 'unknown gender satisfied article'; END IF;
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',ARRAY[b],NULL,10,50,'{}');
 IF jsonb_array_length(payload->'items')<>1 THEN RAISE EXCEPTION 'unfiltered unknown gender omitted'; END IF;
 -- A filtered-out exact headword must not suppress an eligible inflection match.
 UPDATE public.word_entries SET headword='filter-query' WHERE id='40752000-0000-0000-0000-000000000001';
 INSERT INTO public.word_forms(language_code,dictionary_id,form,word_id,headword)
 SELECT 'nl',b,'filter-query',id,headword FROM public.word_entries WHERE dictionary_id=b;
 PERFORM public.refresh_dictionary_search_document(id,2) FROM public.word_entries WHERE dictionary_id IN(a,b);
 payload := public.lookup_platform_v2_library_filtered_entries(u,'filter-query','nl',ARRAY[a,b],NULL,10,50,'{"parts":["noun"]}');
 IF payload ? 'error' OR jsonb_array_length(payload->'items')<>1 OR payload#>>'{items,0,dictionary_id}'<>b::text THEN RAISE EXCEPTION 'POS scope after tier suppression: %',payload; END IF;
 -- Personal entries have the same filter policy when their search document is absent.
 DELETE FROM public.dictionary_search_documents WHERE dictionary_id='40751000-0000-0000-0000-000000000003';
 payload := public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',NULL,NULL,10,50,'{"parts":["noun"],"article":"de"}');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'items') item WHERE item->>'dictionary_id'='40751000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'personal fallback missing'; END IF;
 FOREACH invalid IN ARRAY ARRAY['null','[]','{"parts":null}','{"parts":[null]}','{"parts":["unknown"]}','{"article":"de"}','{"parts":["noun"],"article":"a"}','{"extra":true}']::jsonb[] LOOP
  IF public.lookup_platform_v2_library_filtered_entries(u,'scopeword','nl',NULL,NULL,10,50,invalid)->>'error'<>'invalid_library_filters' THEN RAISE EXCEPTION 'accepted invalid filters: %',invalid; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.user_card_status WHERE user_id=u) OR EXISTS(SELECT 1 FROM public.training_sessions WHERE user_id=u)
  OR EXISTS(SELECT 1 FROM public.user_card_action_events WHERE user_id=u) THEN RAISE EXCEPTION 'filtered lookup wrote learning state'; END IF;
END;
$$;
-- POS aliases and two-article spelling are independent of article selection order.
DO $$
DECLARE code text; canonical text;
BEGIN
 FOR code,canonical IN SELECT * FROM (VALUES('zn','noun'),('ww','verb'),('bn','adjective'),('bw','adverb'),('vnw','pronoun'),('vz','preposition'),('vw','conjunction'),('tw','numeral'),('lidw','article'),('tsw','interjection')) parts LOOP
  IF NOT private.library_entry_matches_filters_v1(code,NULL,jsonb_build_object('parts',jsonb_build_array(canonical),'article',NULL)) THEN RAISE EXCEPTION 'POS alias %',code; END IF;
 END LOOP;
 IF NOT private.library_entry_matches_filters_v1('noun','het / de','{"parts":["noun"],"article":"de"}')
  OR NOT private.library_entry_matches_filters_v1('zn','de/het','{"parts":["noun"],"article":"het"}')
  OR NOT private.library_entry_matches_filters_v1('verb',NULL,'{"parts":["noun","verb"],"article":"het"}') THEN RAISE EXCEPTION 'mixed/article policy'; END IF;
END;
$$;
ROLLBACK;
