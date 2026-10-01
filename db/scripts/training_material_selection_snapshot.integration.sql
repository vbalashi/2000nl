-- Disposable database only. No learner action is graded; all fixtures roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('40700000-0000-0000-0000-000000000001','material-policy@example.test'),
 ('40700000-0000-0000-0000-000000000002','other-material@example.test');
INSERT INTO public.languages(code,name) VALUES('en','English') ON CONFLICT DO NOTHING;
INSERT INTO public.dictionaries(id,language_code,slug,name,visibility) VALUES
 ('40710000-0000-0000-0000-000000000001','nl','material-a','Material A','public'),
 ('40710000-0000-0000-0000-000000000002','nl','material-b','Material B','public'),
 ('40710000-0000-0000-0000-000000000004','en','material-en','Material EN','public');
INSERT INTO public.word_entries(id,language_code,headword,meaning_id,dictionary_id,part_of_speech,raw)
SELECT ('40720000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 CASE WHEN i=4 THEN 'en' ELSE 'nl' END,'material-'||i,1,
 CASE WHEN i IN (1,2,4) THEN ('40710000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid END,'zn',
 '{"meanings":[{"definition":"A test meaning","examples":["A test sentence"],"idioms":[{"expression":"test expression","explanation":"test explanation"}]}]}'
FROM generate_series(1,4) i;
INSERT INTO public.user_word_lists(id,user_id,language_code,name) VALUES
 ('40730000-0000-0000-0000-000000000001','40700000-0000-0000-0000-000000000001','nl','Mixed material'),
 ('40730000-0000-0000-0000-000000000002','40700000-0000-0000-0000-000000000002','nl','Private other list');
INSERT INTO public.user_word_list_items(list_id,word_id)
SELECT '40730000-0000-0000-0000-000000000001',id FROM public.word_entries WHERE headword LIKE 'material-%';
INSERT INTO public.user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_last_interval,next_review_at,hidden)
SELECT '40700000-0000-0000-0000-000000000001',id,'definition-to-word',true,2,now()-interval '1 day',false
FROM public.word_entries WHERE headword LIKE 'material-%';
INSERT INTO private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
SELECT id,'example','active','test','test','test-example','raw.meanings[0].examples[0]'
FROM public.word_entries WHERE headword LIKE 'material-%';
INSERT INTO private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
SELECT id,'idiom','active','test','test','test-idiom','raw.meanings[0].idioms[0].expression'
FROM public.word_entries WHERE headword LIKE 'material-%';
INSERT INTO private.platform_v2_content_nodes(entry_id,parent_content_node_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
SELECT entry_id,id,'idiom-explanation','active','test','test','test-explanation','raw.meanings[0].idioms[0].explanation'
FROM private.platform_v2_content_nodes WHERE source_text_fingerprint='test-idiom';
SELECT set_config('request.jwt.claim.sub','40700000-0000-0000-0000-000000000001',true);
DO $$
DECLARE
 u uuid := '40700000-0000-0000-0000-000000000001';
 list_id uuid := '40730000-0000-0000-0000-000000000001';
 disabled jsonb := '{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":false},{"code":"en","paused":true}],"disabledDictionaryIds":["40710000-0000-0000-0000-000000000001"]}';
 paused jsonb := '{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":true},{"code":"en","paused":false}],"disabledDictionaryIds":["40710000-0000-0000-0000-000000000001"]}';
 scope jsonb; old_scope jsonb; run jsonb; retry jsonb; run_id uuid; request_id uuid := gen_random_uuid();
 rows_before jsonb; count_found integer; signature text;
BEGIN
 -- Backward-compatible empty preference list allows all catalog material.
 old_scope := private.resolve_training_material_selection_v1(u,list_id,'user','{}');
 IF old_scope#>'{materialSelection,allowedLanguageCodes}' <> 'null'::jsonb THEN RAISE EXCEPTION 'implicit catalog changed'; END IF;
 run := public.start_training_session(u,ARRAY['definition-to-word'],list_id,'user','review','{}','2',request_id,2);
 run_id := (run->>'sessionId')::uuid;
 SELECT jsonb_agg(to_jsonb(member) ORDER BY ordinal) INTO rows_before FROM public.training_session_members member WHERE session_id=run_id;
 IF jsonb_array_length(rows_before) <> 2 THEN RAISE EXCEPTION 'baseline run missing members: %',run; END IF;
 UPDATE public.user_settings SET material_preferences=disabled WHERE user_id=u;
 -- A forged snapshot cannot bypass current preferences on plan/new start.
 scope := private.resolve_training_material_selection_v1(u,list_id,'user',old_scope);
 IF private.training_material_entry_selected_v1('nl','40710000-0000-0000-0000-000000000001',scope)
    OR private.training_material_entry_selected_v1('en',NULL,scope)
    OR NOT private.training_material_entry_selected_v1('nl',NULL,scope) THEN RAISE EXCEPTION 'material matcher'; END IF;
 SELECT (public.get_training_session_plan(u,ARRAY['definition-to-word'],list_id,'user','review',old_scope,'10',2)->>'plannedTotal')::integer INTO count_found;
 IF count_found<>2 THEN RAISE EXCEPTION 'plan did not reread account: %',count_found; END IF;
 -- Mixed-language collection source candidates obey the same snapshot.
 SELECT count(*) INTO count_found FROM private.training_extra_source_entries_v1(u,list_id,'user',scope);
 IF count_found<>2 THEN RAISE EXCEPTION 'extra scope mismatch: %',count_found; END IF;
 SELECT count(*) INTO count_found FROM private.platform_v2_idiom_exercise_candidates_v1_with_material(scope,u,'direct',100,0);
 IF count_found<>2 THEN RAISE EXCEPTION 'legacy idiom filtered before limit: %',count_found; END IF;
 SELECT count(*) INTO count_found FROM private.platform_v2_translation_exercise_candidates_v1_with_material(scope,u,100,0);
 IF count_found<>2 THEN RAISE EXCEPTION 'legacy translation filtered before limit: %',count_found; END IF;
 UPDATE public.user_settings SET material_preferences=paused WHERE user_id=u;
 retry := public.start_training_session(u,ARRAY['definition-to-word'],list_id,'user','review','{}','2',request_id,2);
 IF retry->>'sessionId' IS DISTINCT FROM run->>'sessionId' THEN RAISE EXCEPTION 'retry changed existing run'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(member) ORDER BY ordinal) FROM public.training_session_members member WHERE session_id=run_id) IS DISTINCT FROM rows_before THEN RAISE EXCEPTION 'pause mutated members'; END IF;
 IF jsonb_array_length(public.get_training_session_snapshot(u,run_id)->'members') <> 2 THEN RAISE EXCEPTION 'paused run cannot resume'; END IF;
 retry:=public.mark_training_session_member_unavailable(u,run_id,
   (rows_before->0->>'entry_id')::uuid,'definition-to-word','projection-missing');
 IF retry->>'status' <> 'unavailable-replaced' THEN RAISE EXCEPTION 'paused run lost replacement pool: %',retry; END IF;
 -- Frozen scope remains usable for replacements after account changes.
 SELECT count(*) INTO count_found FROM private.training_extra_source_entries_v1(u,list_id,'user',old_scope);
 IF count_found<>4 THEN RAISE EXCEPTION 'frozen extra scope changed'; END IF;
 BEGIN
   PERFORM public.start_training_session(u,ARRAY['definition-to-word'],list_id,'user','review',old_scope,'2',gen_random_uuid(),2);
   RAISE EXCEPTION 'paused language accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'training_material_unavailable' THEN RAISE; END IF; END;
 BEGIN
   PERFORM private.resolve_training_material_selection_v1(u,'40730000-0000-0000-0000-000000000002','user','{}');
   RAISE EXCEPTION 'other user list accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'training_material_unavailable' THEN RAISE; END IF; END;
 UPDATE public.user_settings SET material_preferences=disabled WHERE user_id=u;
 BEGIN
   PERFORM private.resolve_training_material_selection_v1(u,NULL,'curated',
    '{"dictionaryScope":{"mode":"selected","languageCode":"nl","dictionaryIds":["40710000-0000-0000-0000-000000000001"]}}');
   RAISE EXCEPTION 'disabled dictionary accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'training_material_unavailable' THEN RAISE; END IF; END;
 -- Material preferences must not override independent dictionary access revocation.
 UPDATE public.dictionaries SET visibility='private',owner_user_id='40700000-0000-0000-0000-000000000002'
 WHERE id='40710000-0000-0000-0000-000000000001';
 SELECT count(*) INTO count_found FROM private.training_extra_source_entries_v1(u,list_id,'user',old_scope);
 IF count_found<>3 THEN RAISE EXCEPTION 'frozen snapshot bypassed dictionary access'; END IF;
 UPDATE public.dictionaries SET visibility='public',owner_user_id=NULL WHERE id='40710000-0000-0000-0000-000000000001';
 -- Every currently callable family, including cached v1, stores the snapshot.
 request_id:=gen_random_uuid();
 run:=private.start_platform_v2_idiom_training_session_v1(u,'direct','10',request_id);
 run_id:=(run->>'sessionId')::uuid;
 IF (SELECT count(*) FROM public.training_session_exercise_members WHERE session_id=run_id) <> 2 THEN RAISE EXCEPTION 'legacy idiom start scope: %',run; END IF;
 UPDATE public.user_settings SET material_preferences=paused WHERE user_id=u;
 retry:=private.start_platform_v2_idiom_training_session_v1(u,'direct','10',request_id);
 IF retry->>'sessionId' IS DISTINCT FROM run->>'sessionId' THEN RAISE EXCEPTION 'legacy idiom receipt changed'; END IF;
 UPDATE public.user_settings SET material_preferences=disabled WHERE user_id=u;
 request_id:=gen_random_uuid();
 run:=private.start_platform_v2_translation_training_session_v1(u,'10',request_id);
 run_id:=(run->>'sessionId')::uuid;
 IF (SELECT count(*) FROM public.training_session_exercise_members WHERE session_id=run_id) <> 2 THEN RAISE EXCEPTION 'legacy translation start scope: %',run; END IF;
 UPDATE public.user_settings SET material_preferences=paused WHERE user_id=u;
 retry:=private.start_platform_v2_translation_training_session_v1(u,'10',request_id);
 IF retry->>'sessionId' IS DISTINCT FROM run->>'sessionId' THEN RAISE EXCEPTION 'legacy translation receipt changed'; END IF;
 UPDATE public.user_settings SET material_preferences=disabled WHERE user_id=u;
 request_id:=gen_random_uuid();
 run:=private.start_platform_v2_idiom_training_session_v2(u,'direct','10',request_id,list_id,'user','both',old_scope,2);
 run_id:=(run->>'sessionId')::uuid;
 IF (SELECT count(*) FROM public.training_session_exercise_members WHERE session_id=run_id) <> 2 THEN RAISE EXCEPTION 'scoped idiom start: %',run; END IF;
 UPDATE public.user_settings SET material_preferences=paused WHERE user_id=u;
 retry:=private.start_platform_v2_idiom_training_session_v2(u,'direct','10',request_id,list_id,'user','both',old_scope,2);
 IF retry->>'sessionId' IS DISTINCT FROM run->>'sessionId' THEN RAISE EXCEPTION 'idiom receipt changed'; END IF;
 UPDATE public.user_settings SET material_preferences=disabled WHERE user_id=u;
 request_id:=gen_random_uuid();
 run:=private.start_platform_v2_translation_training_session_v2(u,'10',request_id,list_id,'user','both',old_scope,2);
 run_id:=(run->>'sessionId')::uuid;
 IF (SELECT count(*) FROM public.training_session_exercise_members WHERE session_id=run_id) <> 2 THEN RAISE EXCEPTION 'scoped translation start: %',run; END IF;
 UPDATE public.user_settings SET material_preferences=paused WHERE user_id=u;
 retry:=private.start_platform_v2_translation_training_session_v2(u,'10',request_id,list_id,'user','both',old_scope,2);
 IF retry->>'sessionId' IS DISTINCT FROM run->>'sessionId' THEN RAISE EXCEPTION 'translation receipt changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_card_action_events WHERE user_id=u) THEN RAISE EXCEPTION 'planning created learning actions'; END IF;
 -- Private helpers must not become client-callable through default grants.
 FOREACH signature IN ARRAY ARRAY[
  'private.resolve_training_material_selection_v1(uuid,uuid,text,jsonb)',
  'private.platform_v2_idiom_exercise_candidates_v1_with_material(jsonb,uuid,text,integer,integer)',
  'private.platform_v2_translation_exercise_candidates_v1_with_material(jsonb,uuid,integer,integer)'
 ] LOOP
  IF has_function_privilege('authenticated',signature,'EXECUTE') OR has_function_privilege('anon',signature,'EXECUTE') THEN RAISE EXCEPTION 'private helper leaked: %',signature; END IF;
 END LOOP;
END;
$$;
ROLLBACK;
