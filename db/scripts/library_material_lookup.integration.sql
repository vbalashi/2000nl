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
DO $$
DECLARE
 u uuid := '40750000-0000-0000-0000-000000000001';
 a uuid := '40751000-0000-0000-0000-000000000001';
 b uuid := '40751000-0000-0000-0000-000000000002';
 personal uuid := '40751000-0000-0000-0000-000000000003';
 other_personal uuid := '40751000-0000-0000-0000-000000000004';
 payload jsonb; next_payload jsonb; cursor text; baseline jsonb;
BEGIN
 baseline := public.lookup_platform_v2_entries(u,false,'scopeword','nl',NULL,1,50);
 payload := public.lookup_platform_v2_library_entries(u,'scopeword','nl',ARRAY[b],NULL,1,50);
 IF payload ? 'error' OR jsonb_array_length(payload->'items')<>1
   OR payload#>>'{items,0,dictionary_id}'<>b::text OR payload#>>'{page,nextGroupCursor}' IS NOT NULL THEN
  RAISE EXCEPTION 'selected source not filtered before page: %',payload;
 END IF;
 payload := public.lookup_platform_v2_library_entries(u,'scopeword','nl',ARRAY[a,b],NULL,1,50);
 cursor := payload#>>'{page,nextGroupCursor}';
 IF cursor IS NULL THEN RAISE EXCEPTION 'missing scoped cursor: %',payload; END IF;
 next_payload := public.lookup_platform_v2_library_entries(u,'scopeword','nl',ARRAY[b,a,a],cursor,1,50);
 IF next_payload ? 'error' OR jsonb_array_length(next_payload->'items')<>1
   OR next_payload#>>'{items,0,id}'=payload#>>'{items,0,id}' THEN RAISE EXCEPTION 'canonical scope pagination: %',next_payload; END IF;
 IF public.lookup_platform_v2_library_entries(u,'scopeword','nl',ARRAY[b],cursor,1,50)->>'error'<>'invalid_cursor' THEN RAISE EXCEPTION 'cursor crossed selection'; END IF;
 UPDATE public.user_settings SET material_preferences=jsonb_build_object('schemaVersion',1,'learningLanguages','[]'::jsonb,'disabledDictionaryIds',jsonb_build_array(a,personal)) WHERE user_id=u;
 payload := public.lookup_platform_v2_library_entries(u,'scopeword','nl',NULL,NULL,10,50);
 IF jsonb_array_length(payload->'items')<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'items') item WHERE item->>'dictionary_id' IN(a::text,other_personal::text)) THEN RAISE EXCEPTION 'disabled/ACL/personal policy: %',payload; END IF;
 IF public.lookup_platform_v2_library_entries(u,'scopeword','nl',ARRAY[a,b],cursor,1,50)->>'error'<>'invalid_cursor' THEN RAISE EXCEPTION 'cursor crossed account preferences'; END IF;
 IF public.lookup_platform_v2_entries(u,false,'scopeword','nl',NULL,1,50)<>baseline THEN RAISE EXCEPTION 'normal lookup changed'; END IF;
 -- ACL changes remain live even when a selected dictionary was readable on the previous page.
 UPDATE public.dictionaries SET visibility='private' WHERE id=b;
 payload := public.lookup_platform_v2_library_entries(u,'scopeword','nl',ARRAY[b],NULL,10,50);
 IF jsonb_array_length(payload->'items')<>0 THEN RAISE EXCEPTION 'revoked dictionary access leaked'; END IF;
 UPDATE public.dictionaries SET visibility='public' WHERE id=b;
 UPDATE public.user_settings SET material_preferences='{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}' WHERE user_id=u;
 -- Excluding another dictionary's headword tier must permit a form match in the selected source.
 UPDATE public.word_entries SET headword='exclusive-query' WHERE dictionary_id=a;
 INSERT INTO public.word_forms(language_code,dictionary_id,form,word_id,headword) SELECT 'nl',b,'exclusive-query',id,headword FROM public.word_entries WHERE dictionary_id=b;
 PERFORM public.refresh_dictionary_search_document(id,2) FROM public.word_entries WHERE dictionary_id IN(a,b);
 payload := public.lookup_platform_v2_library_entries(u,'exclusive-query','nl',ARRAY[b],NULL,10,50);
 IF payload ? 'error' OR jsonb_array_length(payload->'items')<>1 OR payload#>>'{items,0,dictionary_id}'<>b::text THEN RAISE EXCEPTION 'tier suppression occurred before source scope: %',payload; END IF;
 UPDATE public.user_settings SET material_preferences='{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":true},{"code":"en","paused":false}],"disabledDictionaryIds":[]}' WHERE user_id=u;
 payload := public.lookup_platform_v2_library_entries(u,'scopeword','nl',NULL,NULL,10,50);
 IF jsonb_array_length(payload->'items')<>0 THEN RAISE EXCEPTION 'paused language leaked'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_card_status WHERE user_id=u) OR EXISTS(SELECT 1 FROM public.training_sessions WHERE user_id=u) THEN RAISE EXCEPTION 'lookup created learning state/session'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_card_action_events WHERE user_id=u) THEN RAISE EXCEPTION 'lookup mutated learning history'; END IF;
END;
$$;
ROLLBACK;
