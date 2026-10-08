BEGIN;
CREATE OR REPLACE FUNCTION public.get_meaning_learning_progress_v1(p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private,extensions,pg_temp AS $$
DECLARE u uuid:=auth.uid(); result jsonb; entry public.word_entries%rowtype; exclusion uuid; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 SELECT * INTO entry FROM public.word_entries WHERE id=p_entry_id;
 IF NOT FOUND OR (entry.dictionary_id IS NOT NULL AND NOT public.can_access_dictionary(u,entry.dictionary_id,'read')) THEN RAISE EXCEPTION 'meaning_unavailable'; END IF;
 SELECT id INTO exclusion FROM private.training_headword_exclusions WHERE user_id=u AND entry_id=p_entry_id AND restored_at IS NULL;
 SELECT jsonb_build_object('entryId',p_entry_id,'headword',entry.headword,'exclusionId',exclusion,'directions',jsonb_agg(jsonb_build_object(
  'cardTypeId',s.card_type_id,'stateRevision',COALESCE(s.state_revision::text,'untracked'),
  'knownMarkId',s.known_mark_id,'knownMarkRevision',s.known_mark_revision,'knownMarkedAt',s.known_marked_at,
  'phase',CASE WHEN s.hidden THEN 'hidden' WHEN s.frozen_until>private.training_reference_now_v1() THEN 'frozen' WHEN s.in_learning THEN 'learning' WHEN s.fsrs_reps>0 OR s.last_reviewed_at IS NOT NULL THEN 'reviewing' ELSE 'new' END,
  'presentations',COALESCE(s.seen_count,0),'gradedAttempts',COALESCE(s.fsrs_reps,0),'lastGrade',s.fsrs_last_grade,
  'lastReviewedAt',s.last_reviewed_at,'nextReviewAt',COALESCE(s.learning_due_at,s.next_review_at),
  'stability',s.fsrs_stability,'difficulty',s.fsrs_difficulty) ORDER BY s.card_type_id DESC)) INTO result
 FROM public.get_platform_v2_card_states_for_entries(u,ARRAY[p_entry_id],ARRAY['word-to-definition','definition-to-word']) s;
 RETURN result || jsonb_build_object('revision',encode(digest(result::text,'sha256'),'hex'));
END;$$;
REVOKE ALL ON FUNCTION public.get_meaning_learning_progress_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_meaning_learning_progress_v1(uuid) TO authenticated,service_role;
CREATE TABLE private.meaning_resume_events(user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,client_event_id uuid NOT NULL,entry_id uuid NOT NULL REFERENCES public.word_entries(id) ON DELETE RESTRICT,request_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT private.training_reference_now_v1(),PRIMARY KEY(user_id,client_event_id));
ALTER TABLE private.meaning_resume_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.meaning_resume_events FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.resume_meaning_learning_as_principal_v1(p_user_id uuid,p_entry_id uuid,p_expected_revision text,p_client_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,extensions,pg_temp AS $$
DECLARE role text:=COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role'); previous private.meaning_resume_events%rowtype; hash text; progress jsonb; known record; response jsonb; BEGIN
 IF role IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF p_client_event_id IS NULL OR p_entry_id IS NULL OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'invalid_meaning_resume'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
 hash:=encode(digest(jsonb_build_object('entryId',p_entry_id,'revision',p_expected_revision)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtext('meaning-resume:'||p_user_id::text||':'||p_client_event_id::text));
 SELECT * INTO previous FROM private.meaning_resume_events WHERE user_id=p_user_id AND client_event_id=p_client_event_id;
 IF FOUND THEN IF previous.request_hash<>hash THEN RAISE EXCEPTION 'meaning_resume_idempotency_conflict'; END IF; RETURN previous.response || jsonb_build_object('status','duplicate'); END IF;
 -- Same outer exclusion lock as explicit reviews and Library exclusion.
 PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||p_user_id::text||':'||private.training_headword_group_v1(p_entry_id)::text));
 PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:'||p_user_id::text||':'||p_entry_id::text));
 progress:=public.get_meaning_learning_progress_v1(p_entry_id);
 IF progress->>'revision' IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'meaning_progress_conflict'; END IF;
 IF progress->>'exclusionId' IS NOT NULL THEN PERFORM public.perform_training_headword_exclusion_as_principal_v1(p_user_id,'restore-headword',gen_random_uuid(),p_entry_id,NULL,(progress->>'exclusionId')::uuid,NULL); END IF;
 FOR known IN SELECT k.*,COALESCE(s.state_revision::text,'untracked') state_revision FROM public.user_card_known_marks k LEFT JOIN public.user_card_status s ON s.user_id=k.user_id AND s.entry_id=k.entry_id AND s.card_type_id=k.card_type_id WHERE k.user_id=p_user_id AND k.entry_id=p_entry_id AND k.card_type_id IN ('word-to-definition','definition-to-word') AND k.cleared_at IS NULL ORDER BY k.card_type_id LOOP
  -- A historical paired mark may have cleared this sibling already.
  IF EXISTS(SELECT 1 FROM public.user_card_known_marks WHERE id=known.id AND cleared_at IS NULL) THEN
   PERFORM public.perform_platform_v2_card_action_as_principal(p_user_id,'undo-known',p_entry_id,known.card_type_id,(SELECT state_revision::text FROM public.user_card_status WHERE user_id=p_user_id AND entry_id=p_entry_id AND card_type_id=known.card_type_id),known.id,known.revision::text,NULL,gen_random_uuid(),NULL,'first_party',NULL,NULL::uuid);
  END IF;
 END LOOP;
 PERFORM private.enroll_familiar_meaning_directions_v1(p_user_id,p_entry_id);
 response:=jsonb_build_object('status','accepted','clientEventId',p_client_event_id,'progress',public.get_meaning_learning_progress_v1(p_entry_id));
 INSERT INTO private.meaning_resume_events(user_id,client_event_id,entry_id,request_hash,response) VALUES(p_user_id,p_client_event_id,p_entry_id,hash,response);
 RETURN response;
END;$$;
REVOKE ALL ON FUNCTION public.resume_meaning_learning_as_principal_v1(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resume_meaning_learning_as_principal_v1(uuid,uuid,text,uuid) TO service_role;
-- Batch lookup shares the same permission checks and semantic projection.
CREATE OR REPLACE FUNCTION public.get_meanings_learning_progress_v1(p_entry_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF cardinality(p_entry_ids)>100 THEN RAISE EXCEPTION 'meaning_progress_limit'; END IF;
 SELECT COALESCE(jsonb_agg(public.get_meaning_learning_progress_v1(id)), '[]'::jsonb) INTO result FROM (SELECT DISTINCT unnest(p_entry_ids) id) targets;
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION public.get_meanings_learning_progress_v1(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_meanings_learning_progress_v1(uuid[]) TO authenticated,service_role;
COMMIT;
