BEGIN;
CREATE TABLE private.training_exercise_choice_events (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 client_event_id uuid NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY (user_id,client_event_id)
);
ALTER TABLE private.training_exercise_choice_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.training_exercise_choice_events FROM PUBLIC,anon,authenticated,service_role;

-- A snapshot is tied to the exact content identity, including its fingerprint.
CREATE FUNCTION public.get_training_exercise_choice_v1(p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); target private.platform_v2_training_exercise_targets%rowtype; states jsonb;
BEGIN
 SELECT * INTO target FROM private.platform_v2_training_exercise_targets WHERE id=p_target AND family IN ('idiom','translation') AND visibility_state='active';
 IF principal IS NULL OR NOT FOUND OR NOT private.entry_access_v1(principal,target.entry_id,'train') OR NOT EXISTS
  (SELECT 1 FROM private.platform_v2_content_nodes n WHERE n.id=target.content_node_id AND n.entry_id=target.entry_id AND n.binding_state='active' AND n.source_text_fingerprint=target.source_text_fingerprint)
 THEN RAISE EXCEPTION 'training_exercise_target_unavailable'; END IF;
 SELECT COALESCE(jsonb_object_agg(t.direction,k.id::text),'{}'::jsonb) INTO states
 FROM private.platform_v2_training_exercise_targets t JOIN private.training_exercise_known_marks k ON k.target_id=t.id AND k.user_id=principal AND k.cleared_at IS NULL
 WHERE t.entry_id=target.entry_id AND t.content_node_id=target.content_node_id AND t.family=target.family AND t.source_text_fingerprint=target.source_text_fingerprint AND t.visibility_state='active';
 RETURN jsonb_build_object('targetId',target.id,'entryId',target.entry_id,'family',target.family,'direction',target.direction,'marks',states,'revision',encode(digest(states::text,'sha256'),'hex'));
END; $$;
REVOKE ALL ON FUNCTION public.get_training_exercise_choice_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_training_exercise_choice_v1(uuid) TO authenticated,service_role;

CREATE FUNCTION public.set_training_exercise_choice_as_principal_v1(p_user_id uuid,p_target uuid,p_session_id uuid,p_known text[],p_revision text,p_event uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE target private.platform_v2_training_exercise_targets%rowtype; prior private.training_exercise_choice_events%rowtype; snapshot jsonb; hash text; d text; tid uuid; mark_id uuid; result jsonb; consumption jsonb; remaining integer; node private.platform_v2_content_nodes%rowtype; locked_target uuid;
BEGIN
 IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role') IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_target IS NULL OR p_session_id IS NULL OR p_event IS NULL OR p_known IS NULL OR p_revision IS NULL OR p_revision !~ '^[a-f0-9]{64}$' OR array_position(p_known,NULL) IS NOT NULL OR cardinality(p_known)<>(SELECT count(DISTINCT x) FROM unnest(p_known) x) THEN RAISE EXCEPTION 'invalid_training_known_choice'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
 hash:=encode(digest(jsonb_build_array(p_target,p_session_id,ARRAY(SELECT x FROM unnest(p_known) x ORDER BY x),p_revision)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtext('exercise-choice:'||p_user_id::text||':'||p_event::text));
 SELECT * INTO prior FROM private.training_exercise_choice_events WHERE user_id=p_user_id AND client_event_id=p_event;
 IF FOUND THEN IF prior.request_hash<>hash THEN RAISE EXCEPTION 'known_choice_idempotency_conflict'; END IF; RETURN prior.response||jsonb_build_object('status','duplicate'); END IF;
 PERFORM private.require_active_training_session_v1(p_user_id,p_session_id);
 SELECT * INTO target FROM private.platform_v2_training_exercise_targets WHERE id=p_target AND family IN ('idiom','translation');
 IF NOT FOUND OR NOT (p_known <@ (CASE WHEN target.family='idiom' THEN ARRAY['direct','reverse'] ELSE ARRAY['recall'] END)) THEN RAISE EXCEPTION 'invalid_training_known_choice'; END IF;
 PERFORM private.lock_shared_learning_source_v1(p_user_id,target.entry_id);
 PERFORM pg_advisory_xact_lock(hashtext('exercise-choice-target:'||p_user_id::text||':'||target.content_node_id::text||':'||target.source_text_fingerprint));
 SELECT * INTO node FROM private.platform_v2_content_nodes WHERE id=target.content_node_id;
 -- Lock both direction identities before reading the revision, including a
 -- sibling not yet encountered in training. Other Known writers take these
 -- same target locks in set_training_exercise_known_v1.
 FOREACH d IN ARRAY (CASE WHEN target.family='idiom' THEN ARRAY['direct','reverse'] ELSE ARRAY['recall'] END) LOOP
  PERFORM public.ensure_platform_v2_training_exercise_target_as_principal_v1(target.entry_id,target.content_node_id,target.family,d,node.last_source_revision,target.source_text_fingerprint);
 END LOOP;
 FOR locked_target IN SELECT t.id FROM private.platform_v2_training_exercise_targets t WHERE t.entry_id=target.entry_id AND t.content_node_id=target.content_node_id AND t.family=target.family AND t.source_text_fingerprint=target.source_text_fingerprint AND t.visibility_state='active' ORDER BY t.id LOOP
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text||':exercise-target:'||locked_target::text));
 END LOOP;
 snapshot:=public.get_training_exercise_choice_v1(p_target);
 IF snapshot->>'revision' IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'exercise_choice_conflict'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_sessions WHERE id=p_session_id AND user_id=p_user_id AND exercise_family=target.family) THEN RAISE EXCEPTION 'training_exercise_session_family_mismatch'; END IF;
 consumption:=private.consume_platform_v2_training_exercise_session_member_v1(p_user_id,p_session_id,p_target);
 SELECT * INTO node FROM private.platform_v2_content_nodes WHERE id=target.content_node_id;
 FOREACH d IN ARRAY (CASE WHEN target.family='idiom' THEN ARRAY['direct','reverse'] ELSE ARRAY['recall'] END) LOOP
  SELECT t.id INTO tid FROM private.platform_v2_training_exercise_targets t WHERE t.entry_id=target.entry_id AND t.content_node_id=target.content_node_id AND t.family=target.family AND t.direction=d AND t.source_text_fingerprint=target.source_text_fingerprint AND t.visibility_state='active' LIMIT 1;
  IF tid IS NULL AND d=ANY(p_known) THEN tid:=public.ensure_platform_v2_training_exercise_target_as_principal_v1(target.entry_id,target.content_node_id,target.family,d,node.last_source_revision,target.source_text_fingerprint); END IF;
  SELECT k.id INTO mark_id FROM private.training_exercise_known_marks k WHERE k.user_id=p_user_id AND k.target_id=tid AND k.cleared_at IS NULL;
  IF mark_id IS NOT NULL AND NOT d=ANY(p_known) THEN PERFORM private.set_training_exercise_known_v1(p_user_id,tid,false,mark_id);
  ELSIF mark_id IS NULL AND d=ANY(p_known) THEN PERFORM private.set_training_exercise_known_v1(p_user_id,tid,true); END IF;
  tid:=NULL; mark_id:=NULL;
 END LOOP;
 SELECT count(*) INTO remaining FROM public.training_session_exercise_members WHERE session_id=p_session_id AND consumed_at IS NULL AND unavailable_at IS NULL;
 IF remaining=0 THEN UPDATE public.training_sessions SET completed_at=COALESCE(completed_at,private.training_reference_now_v1()),exhausted_at=COALESCE(exhausted_at,private.training_reference_now_v1()),completion_reason=COALESCE(completion_reason,'exhausted') WHERE id=p_session_id; END IF;
 consumption:=consumption||jsonb_build_object('remaining',remaining,'status',CASE WHEN remaining=0 THEN 'consumed-complete' ELSE consumption->>'status' END);
 result:=jsonb_build_object('status','accepted','clientEventId',p_event,'targetId',p_target,'entryId',target.entry_id,'trainingSessionId',p_session_id,'consumption',consumption);
 INSERT INTO private.training_exercise_choice_events VALUES(p_user_id,p_event,hash,result);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.set_training_exercise_choice_as_principal_v1(uuid,uuid,uuid,text[],text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_training_exercise_choice_as_principal_v1(uuid,uuid,uuid,text[],text,uuid) TO service_role;
-- New exercise marks can be returned to learning from the Library, just like
-- converted legacy exclusions. Each individual direction has its own identity.
ALTER FUNCTION public.get_training_exercise_known_choices_v1(uuid) RENAME TO get_legacy_exercise_known_choices_v1;
REVOKE ALL ON FUNCTION public.get_legacy_exercise_known_choices_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_training_exercise_known_choices_v1(p_entry_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE legacy jsonb; direct_marks jsonb; principal uuid:=auth.uid();
BEGIN
 legacy:=public.get_legacy_exercise_known_choices_v1(p_entry_id);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('exclusionId',k.id,'targetId',t.id,'family',t.family,'text',NULLIF(btrim(n.canonical_source_text),''),'directions',jsonb_build_array(t.direction),'kind','mark') ORDER BY k.marked_at,k.id),'[]'::jsonb) INTO direct_marks
 FROM private.training_exercise_known_marks k JOIN private.platform_v2_training_exercise_targets t ON t.id=k.target_id
 LEFT JOIN private.platform_v2_content_nodes n ON n.id=t.content_node_id AND n.binding_state='active' AND n.source_text_fingerprint=t.source_text_fingerprint
 WHERE k.user_id=principal AND k.cleared_at IS NULL AND t.entry_id=p_entry_id
 AND NOT EXISTS(SELECT 1 FROM private.ordinary_pair_known_conversions c WHERE c.user_id=principal AND c.undone_at IS NULL AND k.id=ANY(c.introduced_mark_ids));
 RETURN legacy||direct_marks;
END; $$;
REVOKE ALL ON FUNCTION public.get_training_exercise_known_choices_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_training_exercise_known_choices_v1(uuid) TO authenticated,service_role;
CREATE FUNCTION public.restore_training_exercise_mark_v1(p_mark uuid,p_event uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); mark private.training_exercise_known_marks%rowtype; prior private.training_exercise_choice_events%rowtype; hash text; response jsonb;
BEGIN
 IF principal IS NULL OR p_mark IS NULL OR p_event IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 hash:=encode(digest(jsonb_build_array('restore',p_mark)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtext('exercise-choice:'||principal::text||':'||p_event::text));
 SELECT * INTO prior FROM private.training_exercise_choice_events WHERE user_id=principal AND client_event_id=p_event;
 IF FOUND THEN IF prior.request_hash<>hash THEN RAISE EXCEPTION 'known_choice_idempotency_conflict'; END IF; RETURN prior.response; END IF;
 SELECT * INTO mark FROM private.training_exercise_known_marks WHERE id=p_mark AND user_id=principal AND cleared_at IS NULL;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM private.ordinary_pair_known_conversions c WHERE c.user_id=principal AND c.undone_at IS NULL AND mark.id=ANY(c.introduced_mark_ids)) THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
 PERFORM private.set_training_exercise_known_v1(principal,mark.target_id,false,mark.id);
 response:=jsonb_build_object('status','accepted','markId',p_mark);
 INSERT INTO private.training_exercise_choice_events VALUES(principal,p_event,hash,response);
 RETURN response;
END; $$;
REVOKE ALL ON FUNCTION public.restore_training_exercise_mark_v1(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_training_exercise_mark_v1(uuid,uuid) TO authenticated,service_role;
COMMIT;
