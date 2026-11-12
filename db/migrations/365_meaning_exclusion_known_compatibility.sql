BEGIN;
CREATE TABLE private.training_exercise_known_marks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 target_id uuid NOT NULL REFERENCES private.platform_v2_training_exercise_targets(id),
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 marked_at timestamptz NOT NULL DEFAULT now(),
 mark_event_id uuid NOT NULL REFERENCES public.user_training_exercise_action_events(id),
 cleared_at timestamptz,undo_event_id uuid REFERENCES public.user_training_exercise_action_events(id),
 CHECK((cleared_at IS NULL AND undo_event_id IS NULL) OR(cleared_at IS NOT NULL AND undo_event_id IS NOT NULL))
);
CREATE UNIQUE INDEX training_exercise_known_active_idx ON private.training_exercise_known_marks(user_id,target_id) WHERE cleared_at IS NULL;
ALTER TABLE private.training_exercise_known_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.training_exercise_known_marks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.training_exercise_is_known_v1(p_user uuid,p_target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM private.training_exercise_known_marks WHERE user_id=p_user AND target_id=p_target AND cleared_at IS NULL);
$$;
REVOKE ALL ON FUNCTION private.training_exercise_is_known_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Internal mutation: original pair receipt owns idempotency; never manufactures
-- a review, an ordinary Known mark, or scheduling state for the source word.
CREATE FUNCTION private.set_training_exercise_known_v1(p_user uuid,p_target uuid,p_known boolean,p_expected_mark uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE target private.platform_v2_training_exercise_targets%rowtype; mark private.training_exercise_known_marks%rowtype; event_id uuid:=gen_random_uuid(); client_id uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM private.platform_v2_training_exercise_targets WHERE id=p_target AND family IN ('idiom','translation');
 IF NOT FOUND THEN RAISE EXCEPTION 'training_exercise_target_unavailable'; END IF;
 PERFORM private.lock_shared_learning_source_v1(p_user,target.entry_id);
 IF NOT EXISTS(SELECT 1 FROM private.active_word_entries entry WHERE entry.id=target.entry_id AND private.entry_access_v1(p_user,entry.id,'train'))
  OR NOT EXISTS(SELECT 1 FROM private.platform_v2_content_nodes n WHERE n.id=target.content_node_id AND n.entry_id=target.entry_id AND n.binding_state='active' AND n.source_text_fingerprint=target.source_text_fingerprint)
  OR target.visibility_state<>'active' THEN RAISE EXCEPTION 'training_exercise_target_unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_user::text||':exercise-target:'||p_target::text));
 SELECT * INTO mark FROM private.training_exercise_known_marks WHERE user_id=p_user AND target_id=p_target AND cleared_at IS NULL FOR UPDATE;
 IF p_known AND FOUND THEN RETURN mark.id; END IF;
 IF NOT p_known AND (NOT FOUND OR mark.id IS DISTINCT FROM p_expected_mark) THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
 INSERT INTO public.user_training_exercise_action_events(id,user_id,target_id,session_id,action,result,client_event_id,action_payload_hash,source_context,created_at)
 VALUES(event_id,p_user,p_target,NULL,CASE WHEN p_known THEN 'mark-known' ELSE 'undo-known' END,NULL,client_id,
  encode(digest(jsonb_build_array('conversion-known',p_user,p_target,p_known,p_expected_mark)::text,'sha256'),'hex'),NULL,private.training_reference_now_v1());
 IF p_known THEN
  INSERT INTO private.training_exercise_known_marks(user_id,target_id,mark_event_id,marked_at) VALUES(p_user,p_target,event_id,private.training_reference_now_v1()) RETURNING * INTO mark;
  UPDATE public.training_session_exercise_members m SET unavailable_at=private.training_reference_now_v1(),unavailable_reason='known'
   FROM public.training_sessions s WHERE s.id=m.session_id AND s.user_id=p_user AND m.target_id=p_target AND m.consumed_at IS NULL AND m.unavailable_at IS NULL;
 ELSE
  UPDATE private.training_exercise_known_marks SET cleared_at=private.training_reference_now_v1(),undo_event_id=event_id WHERE id=mark.id;
 END IF;
 RETURN mark.id;
END; $$;
REVOKE ALL ON FUNCTION private.set_training_exercise_known_v1(uuid,uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Original exclusions and their immutable receipts remain available to History.
-- The mapping identifies only Known marks introduced by each conversion.
CREATE TABLE private.meaning_exclusion_known_conversions (
 exclusion_id uuid PRIMARY KEY REFERENCES private.training_headword_exclusions(id),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 entry_id uuid NOT NULL REFERENCES public.word_entries(id),
 introduced_mark_ids uuid[] NOT NULL,
 undo_event_ids uuid[] NOT NULL DEFAULT '{}',
 converted_at timestamptz NOT NULL DEFAULT now(),
 undone_at timestamptz
);
ALTER TABLE private.meaning_exclusion_known_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.meaning_exclusion_known_conversions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.convert_meaning_exclusion_to_known_v1(p_exclusion_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE exclusion private.training_headword_exclusions%rowtype; direction text; receipt jsonb; marks uuid[]:='{}';
BEGIN
 SELECT * INTO exclusion FROM private.training_headword_exclusions WHERE id=p_exclusion_id;
 IF NOT FOUND OR exclusion.restored_at IS NOT NULL OR EXISTS(SELECT 1 FROM private.meaning_exclusion_known_conversions WHERE exclusion_id=p_exclusion_id) THEN RETURN; END IF;
 PERFORM set_config('request.jwt.claim.sub',exclusion.user_id::text,true);
 PERFORM private.lock_shared_learning_source_v1(exclusion.user_id,exclusion.entry_id);
 IF NOT EXISTS(SELECT 1 FROM private.active_word_entries entry WHERE entry.id=exclusion.entry_id AND private.entry_access_v1(exclusion.user_id,entry.id,'train')) THEN RAISE EXCEPTION 'exclusion_target_unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||exclusion.user_id::text||':'||private.training_headword_group_v1(exclusion.entry_id)::text));
 PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:'||exclusion.user_id::text||':'||exclusion.entry_id::text));
 SELECT * INTO exclusion FROM private.training_headword_exclusions WHERE id=p_exclusion_id FOR UPDATE;
 IF exclusion.restored_at IS NOT NULL OR EXISTS(SELECT 1 FROM private.meaning_exclusion_known_conversions WHERE exclusion_id=p_exclusion_id) THEN RETURN; END IF;
 FOREACH direction IN ARRAY ARRAY['word-to-definition','definition-to-word'] LOOP
  IF NOT EXISTS(SELECT 1 FROM public.user_card_known_marks WHERE user_id=exclusion.user_id AND entry_id=exclusion.entry_id AND card_type_id=direction AND cleared_at IS NULL) THEN
   receipt:=private.perform_platform_v2_card_action_non_session_latch_v1(exclusion.user_id,'mark-known',exclusion.entry_id,direction,
    COALESCE((SELECT state_revision::text FROM public.user_card_status WHERE user_id=exclusion.user_id AND entry_id=exclusion.entry_id AND card_type_id=direction),'untracked'),
    NULL,NULL,NULL,gen_random_uuid(),NULL,'first_party',NULL);
   marks:=array_append(marks,(SELECT id FROM public.user_card_known_marks WHERE user_id=exclusion.user_id AND entry_id=exclusion.entry_id AND card_type_id=direction AND cleared_at IS NULL));
  ELSIF EXISTS(SELECT 1 FROM public.user_card_known_marks k WHERE k.user_id=exclusion.user_id AND k.entry_id=exclusion.entry_id AND k.card_type_id=direction AND k.cleared_at IS NULL AND private.known_mark_has_other_conversion_v1(k.id,p_exclusion_id)) THEN
   marks:=array_append(marks,(SELECT id FROM public.user_card_known_marks WHERE user_id=exclusion.user_id AND entry_id=exclusion.entry_id AND card_type_id=direction AND cleared_at IS NULL));
  END IF;
 END LOOP;
 UPDATE private.training_headword_exclusions SET restored_at=private.training_reference_now_v1() WHERE id=p_exclusion_id;
 INSERT INTO private.meaning_exclusion_known_conversions(exclusion_id,user_id,entry_id,introduced_mark_ids) VALUES(p_exclusion_id,exclusion.user_id,exclusion.entry_id,marks);
END; $$;
REVOKE ALL ON FUNCTION private.convert_meaning_exclusion_to_known_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Bounded operator-only transition. Never runs automatically on a managed DB.
CREATE FUNCTION public.convert_meaning_exclusions_to_known_as_principal_v1(p_limit integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,pg_temp AS $$
DECLARE exclusion record; converted integer:=0;
BEGIN
 IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role') IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_conversion_limit'; END IF;
 FOR exclusion IN SELECT id,user_id FROM private.training_headword_exclusions WHERE restored_at IS NULL ORDER BY created_at,id LIMIT p_limit LOOP
  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:'||exclusion.user_id::text));
  PERFORM private.convert_meaning_exclusion_to_known_v1(exclusion.id);
  UPDATE public.training_sessions s SET external_state_revision=external_state_revision+1 FROM public.training_active_runs a
   WHERE a.user_id=exclusion.user_id AND a.session_id=s.id AND s.completed_at IS NULL;
  converted:=converted+1;
 END LOOP;
 RETURN converted;
END; $$;
REVOKE ALL ON FUNCTION public.convert_meaning_exclusions_to_known_as_principal_v1(integer) FROM PUBLIC,anon,authenticated,service_role;
-- Operator/migration owner invokes it as postgres with a service-role claim;
-- deliberately unavailable to the web server's service role.

ALTER FUNCTION public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid) SET SCHEMA private;
ALTER FUNCTION private.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid) RENAME TO perform_legacy_meaning_exclusion_as_principal_v1;
REVOKE ALL ON FUNCTION private.perform_legacy_meaning_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.perform_training_headword_exclusion_as_principal_v1(p_user_id uuid,p_action text,p_client_event_id uuid,p_entry_id uuid,p_card_type_id text,p_exclusion_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE response jsonb; conversion private.meaning_exclusion_known_conversions%rowtype; mark public.user_card_known_marks%rowtype; hash text; event private.training_headword_exclusion_events%rowtype; undo_id uuid; undo_ids uuid[]:='{}';
BEGIN
 IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role') IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
 IF p_action='exclude-headword' THEN
  IF p_client_event_id IS NULL THEN RAISE EXCEPTION 'invalid_exclusion_action'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('training-headword-event:'||p_user_id::text||':'||p_client_event_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:'||p_user_id::text));
  response:=private.perform_legacy_meaning_exclusion_as_principal_v1(p_user_id,p_action,p_client_event_id,p_entry_id,p_card_type_id,p_exclusion_id,p_session_id);
  PERFORM private.convert_meaning_exclusion_to_known_v1((response->>'exclusionId')::uuid);
  RETURN response;
 END IF;
 SELECT * INTO conversion FROM private.meaning_exclusion_known_conversions WHERE exclusion_id=p_exclusion_id AND user_id=p_user_id AND entry_id=p_entry_id;
 IF NOT FOUND THEN RETURN private.perform_legacy_meaning_exclusion_as_principal_v1(p_user_id,p_action,p_client_event_id,p_entry_id,p_card_type_id,p_exclusion_id,p_session_id); END IF;
 IF p_action IS DISTINCT FROM 'restore-headword' OR p_session_id IS NOT NULL OR p_card_type_id IS NOT NULL OR p_client_event_id IS NULL THEN RAISE EXCEPTION 'invalid_exclusion_action'; END IF;
 hash:=encode(digest(jsonb_build_object('action',p_action,'entryId',p_entry_id,'cardTypeId',p_card_type_id,'exclusionId',p_exclusion_id,'sessionId',p_session_id)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtext('training-headword-event:'||p_user_id::text||':'||p_client_event_id::text));
 SELECT * INTO event FROM private.training_headword_exclusion_events WHERE user_id=p_user_id AND client_event_id=p_client_event_id;
 IF FOUND THEN
  IF event.request_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'exclusion_idempotency_conflict'; END IF;
  RETURN event.response||jsonb_build_object('status','duplicate');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('training-active-run:'||p_user_id::text));
 PERFORM private.lock_shared_learning_source_v1(p_user_id,p_entry_id);
 IF NOT EXISTS(SELECT 1 FROM private.active_word_entries entry
   WHERE entry.id=p_entry_id AND private.entry_access_v1(p_user_id,entry.id,'train')) THEN
  RAISE EXCEPTION 'exclusion_target_unavailable';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||p_user_id::text||':'||private.training_headword_group_v1(p_entry_id)::text));
 PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:'||p_user_id::text||':'||p_entry_id::text));
 SELECT * INTO conversion FROM private.meaning_exclusion_known_conversions WHERE exclusion_id=p_exclusion_id FOR UPDATE;
 IF conversion.undone_at IS NOT NULL THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
 -- Never clear a later mark or a Known mark that predated the exclusion.
 FOR mark IN SELECT * FROM public.user_card_known_marks WHERE id=ANY(conversion.introduced_mark_ids) ORDER BY card_type_id LOOP
  IF mark.cleared_at IS NOT NULL THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
  IF NOT private.known_mark_has_other_conversion_v1(mark.id,p_exclusion_id) THEN
  undo_id:=gen_random_uuid();
  PERFORM private.perform_platform_v2_card_action_non_session_latch_v1(p_user_id,'undo-known',p_entry_id,mark.card_type_id,
   COALESCE((SELECT state_revision::text FROM public.user_card_status WHERE user_id=p_user_id AND entry_id=p_entry_id AND card_type_id=mark.card_type_id),'untracked'),
   mark.id,mark.revision::text,NULL,undo_id,NULL,'first_party',NULL);
   undo_ids:=array_append(undo_ids,(SELECT undo_event_id FROM public.user_card_known_marks WHERE id=mark.id));
  END IF;
 END LOOP;
 UPDATE private.meaning_exclusion_known_conversions SET undone_at=private.training_reference_now_v1(),undo_event_ids=undo_ids WHERE exclusion_id=p_exclusion_id;
 response:=jsonb_build_object('status','accepted','actionId',p_action,'clientEventId',p_client_event_id,'exclusionId',p_exclusion_id,'headwordGroupId',private.training_headword_group_v1(p_entry_id),'family','meaning','excluded',false);
 INSERT INTO private.training_headword_exclusion_events(user_id,client_event_id,action,exclusion_id,request_hash,response,created_at) VALUES(p_user_id,p_client_event_id,p_action,p_exclusion_id,hash,response,private.training_reference_now_v1());
 UPDATE public.training_sessions s SET external_state_revision=external_state_revision+1 FROM public.training_active_runs a WHERE a.user_id=p_user_id AND a.session_id=s.id AND s.completed_at IS NULL;
 RETURN response;
END; $$;
REVOKE ALL ON FUNCTION public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid) TO service_role;
-- Retained ordinary recall pairs keep their own immutable receipt identities.
CREATE TABLE private.ordinary_pair_known_conversions (
 exclusion_id uuid PRIMARY KEY REFERENCES private.training_pair_exclusions(id),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 entry_id uuid NOT NULL REFERENCES public.word_entries(id),
 card_type_id text CHECK(card_type_id IN ('word-to-definition','definition-to-word','listen-recognize','listen-type','both-directions')),
 target_id uuid REFERENCES private.platform_v2_training_exercise_targets(id),
 CHECK((card_type_id IS NULL)<>(target_id IS NULL)),
 introduced_mark_ids uuid[] NOT NULL,
 undo_event_ids uuid[] NOT NULL DEFAULT '{}',
 converted_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz
);
ALTER TABLE private.ordinary_pair_known_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ordinary_pair_known_conversions FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX ordinary_pair_known_history_idx ON private.ordinary_pair_known_conversions(user_id,entry_id);

CREATE FUNCTION private.known_mark_has_other_conversion_v1(p_mark uuid,p_exclusion uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM private.meaning_exclusion_known_conversions
  WHERE exclusion_id<>p_exclusion AND undone_at IS NULL AND p_mark=ANY(introduced_mark_ids))
 OR EXISTS(SELECT 1 FROM private.ordinary_pair_known_conversions
  WHERE exclusion_id<>p_exclusion AND undone_at IS NULL AND p_mark=ANY(introduced_mark_ids));
$$;
REVOKE ALL ON FUNCTION private.known_mark_has_other_conversion_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- The persisted pair predicate (not the initiating menu direction) owns scope:
-- recall excluded both directions; audio excluded only its own card.
CREATE FUNCTION private.convert_ordinary_pair_to_known_v1(p_exclusion_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE exclusion private.training_pair_exclusions%rowtype; direction text; scope text; marks uuid[]:='{}'; mark_id uuid; exercise_target uuid; current_target uuid; node private.platform_v2_content_nodes%rowtype;
BEGIN
 SELECT * INTO exclusion FROM private.training_pair_exclusions WHERE id=p_exclusion_id;
 IF NOT FOUND OR exclusion.restored_at IS NOT NULL OR exclusion.family NOT IN ('meaning','idiom','translation')
  OR EXISTS(SELECT 1 FROM private.ordinary_pair_known_conversions WHERE exclusion_id=p_exclusion_id) THEN RETURN; END IF;
 PERFORM set_config('request.jwt.claim.sub',exclusion.user_id::text,true);
 PERFORM pg_advisory_xact_lock(hashtext('training-active-run:'||exclusion.user_id::text));
 PERFORM private.lock_shared_learning_source_v1(exclusion.user_id,exclusion.entry_id);
 IF NOT EXISTS(SELECT 1 FROM private.active_word_entries entry WHERE entry.id=exclusion.entry_id AND private.entry_access_v1(exclusion.user_id,entry.id,'train')) THEN RAISE EXCEPTION 'exclusion_target_unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||exclusion.user_id::text||':'||private.training_headword_group_v1(exclusion.entry_id)::text));
 PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:'||exclusion.user_id::text||':'||exclusion.entry_id::text));
 PERFORM pg_advisory_xact_lock(hashtext('training-pair:'||exclusion.user_id::text||':'||exclusion.pair_key));
 SELECT * INTO exclusion FROM private.training_pair_exclusions WHERE id=p_exclusion_id FOR UPDATE;
 IF exclusion.restored_at IS NOT NULL OR EXISTS(SELECT 1 FROM private.ordinary_pair_known_conversions WHERE exclusion_id=p_exclusion_id) THEN RETURN; END IF;
 IF exclusion.family='meaning' THEN
 IF exclusion.pair_key=private.training_pair_key_v1('meaning',exclusion.entry_id,NULL,NULL,'word-to-definition') THEN scope:='both-directions';
 ELSIF exclusion.pair_key=private.training_pair_key_v1('meaning',exclusion.entry_id,NULL,NULL,'listen-recognize') THEN scope:='listen-recognize';
 ELSIF exclusion.pair_key=private.training_pair_key_v1('meaning',exclusion.entry_id,NULL,NULL,'listen-type') THEN scope:='listen-type';
 ELSE RAISE EXCEPTION 'legacy_pair_identity_unproven'; END IF;
 FOREACH direction IN ARRAY CASE WHEN scope='both-directions' THEN ARRAY['word-to-definition','definition-to-word'] ELSE ARRAY[scope] END LOOP
  SELECT id INTO mark_id FROM public.user_card_known_marks WHERE user_id=exclusion.user_id AND entry_id=exclusion.entry_id AND card_type_id=direction AND cleared_at IS NULL;
  IF mark_id IS NULL THEN
   PERFORM private.perform_platform_v2_card_action_non_session_latch_v1(exclusion.user_id,'mark-known',exclusion.entry_id,direction,
    COALESCE((SELECT state_revision::text FROM public.user_card_status WHERE user_id=exclusion.user_id AND entry_id=exclusion.entry_id AND card_type_id=direction),'untracked'),NULL,NULL,NULL,gen_random_uuid(),NULL,'first_party',NULL);
   SELECT id INTO mark_id FROM public.user_card_known_marks WHERE user_id=exclusion.user_id AND entry_id=exclusion.entry_id AND card_type_id=direction AND cleared_at IS NULL;
   marks:=array_append(marks,mark_id);
  ELSIF private.known_mark_has_other_conversion_v1(mark_id,p_exclusion_id) THEN
   -- Shared conversion lineage, never adopt a learner's pre-existing Known mark.
   marks:=array_append(marks,mark_id);
  END IF;
 END LOOP;
 ELSE
  IF exclusion.pair_key IS DISTINCT FROM private.training_pair_key_v1(exclusion.family,exclusion.entry_id,exclusion.content_node_id,exclusion.source_text_fingerprint,NULL) THEN RAISE EXCEPTION 'legacy_pair_identity_unproven'; END IF;
  SELECT * INTO node FROM private.platform_v2_content_nodes WHERE id=exclusion.content_node_id AND entry_id=exclusion.entry_id AND binding_state='active' AND source_text_fingerprint=exclusion.source_text_fingerprint;
  IF NOT FOUND THEN RAISE EXCEPTION 'training_exercise_target_unavailable'; END IF;
  FOREACH direction IN ARRAY CASE WHEN exclusion.family='idiom' THEN ARRAY['direct','reverse'] ELSE ARRAY['recall'] END LOOP
   current_target:=public.ensure_platform_v2_training_exercise_target_as_principal_v1(exclusion.entry_id,exclusion.content_node_id,exclusion.family,direction,node.last_source_revision,exclusion.source_text_fingerprint);
   exercise_target:=COALESCE(exercise_target,current_target);
   SELECT id INTO mark_id FROM private.training_exercise_known_marks WHERE user_id=exclusion.user_id AND target_id=current_target AND cleared_at IS NULL;
   IF mark_id IS NULL THEN
    mark_id:=private.set_training_exercise_known_v1(exclusion.user_id,current_target,true);
    marks:=array_append(marks,mark_id);
   ELSIF private.known_mark_has_other_conversion_v1(mark_id,p_exclusion_id) THEN marks:=array_append(marks,mark_id); END IF;
  END LOOP;
  direction:=NULL;

 END IF;
 UPDATE private.training_pair_exclusions SET restored_at=private.training_reference_now_v1() WHERE id=p_exclusion_id;
 INSERT INTO private.ordinary_pair_known_conversions(exclusion_id,user_id,entry_id,card_type_id,target_id,introduced_mark_ids) VALUES(p_exclusion_id,exclusion.user_id,exclusion.entry_id,scope,exercise_target,marks);
END; $$;
REVOKE ALL ON FUNCTION private.convert_ordinary_pair_to_known_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid) SET SCHEMA private;
ALTER FUNCTION private.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid) RENAME TO perform_legacy_pair_exclusion_as_principal_v1;
REVOKE ALL ON FUNCTION private.perform_legacy_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.perform_training_pair_exclusion_as_principal_v1(p_user_id uuid,p_action text,p_client_event_id uuid,p_entry_id uuid,p_card_type_id text,p_exercise_target_id uuid,p_exclusion_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,extensions,pg_temp AS $$
DECLARE response jsonb; conversion private.ordinary_pair_known_conversions%rowtype; mark public.user_card_known_marks%rowtype; hash text; event private.training_pair_exclusion_events%rowtype; pair_key text; undo_id uuid; undo_ids uuid[]:='{}'; exercise_mark private.training_exercise_known_marks%rowtype; actual_entry uuid; family text;
BEGIN
 IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role') IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
 -- Other families and audio retain the exact original owner and mutation path.
 IF p_exercise_target_id IS NULL AND (p_card_type_id IS NULL OR p_card_type_id NOT IN ('word-to-definition','definition-to-word','listen-recognize','listen-type')) THEN
  RETURN private.perform_legacy_pair_exclusion_as_principal_v1(p_user_id,p_action,p_client_event_id,p_entry_id,p_card_type_id,p_exercise_target_id,p_exclusion_id,p_session_id);
 END IF;
 IF p_client_event_id IS NULL THEN RAISE EXCEPTION 'invalid_exclusion_action'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('training-pair-event:'||p_user_id::text||':'||p_client_event_id::text));
 IF p_action='exclude-pair' THEN
  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:'||p_user_id::text));
  response:=private.perform_legacy_pair_exclusion_as_principal_v1(p_user_id,p_action,p_client_event_id,p_entry_id,p_card_type_id,p_exercise_target_id,p_exclusion_id,p_session_id);
  PERFORM private.convert_ordinary_pair_to_known_v1((response->>'exclusionId')::uuid);
  RETURN response;
 END IF;
 SELECT * INTO conversion FROM private.ordinary_pair_known_conversions WHERE exclusion_id=p_exclusion_id AND user_id=p_user_id;
 IF NOT FOUND THEN RETURN private.perform_legacy_pair_exclusion_as_principal_v1(p_user_id,p_action,p_client_event_id,p_entry_id,p_card_type_id,p_exercise_target_id,p_exclusion_id,p_session_id); END IF;
 actual_entry:=conversion.entry_id;
 SELECT x.pair_key,x.family INTO pair_key,family FROM private.training_pair_exclusions x WHERE x.id=p_exclusion_id;
 IF conversion.target_id IS NULL THEN
  IF p_entry_id IS DISTINCT FROM actual_entry OR p_exercise_target_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_exclusion_target'; END IF;
 ELSE
  IF p_entry_id IS NOT NULL OR p_card_type_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.platform_v2_training_exercise_targets target
    WHERE target.id=p_exercise_target_id AND target.entry_id=actual_entry AND private.training_pair_key_v1(target.family,target.entry_id,target.content_node_id,target.source_text_fingerprint,NULL)=pair_key) THEN RAISE EXCEPTION 'invalid_exclusion_target'; END IF;
 END IF;
 IF p_action IS DISTINCT FROM 'restore-pair' OR p_session_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_exclusion_action'; END IF;
 hash:=encode(digest(jsonb_build_object('action',p_action,'entryId',p_entry_id,'cardTypeId',p_card_type_id,'exerciseTargetId',p_exercise_target_id,'exclusionId',p_exclusion_id,'sessionId',p_session_id)::text,'sha256'),'hex');
 SELECT * INTO event FROM private.training_pair_exclusion_events WHERE user_id=p_user_id AND client_event_id=p_client_event_id;
 IF FOUND THEN
  IF event.request_hash IS DISTINCT FROM hash THEN RAISE EXCEPTION 'exclusion_idempotency_conflict'; END IF;
  RETURN event.response||jsonb_build_object('status','duplicate');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('training-active-run:'||p_user_id::text));
 PERFORM private.lock_shared_learning_source_v1(p_user_id,actual_entry);
 IF NOT EXISTS(SELECT 1 FROM private.active_word_entries entry WHERE entry.id=actual_entry AND private.entry_access_v1(p_user_id,entry.id,'train')) THEN RAISE EXCEPTION 'exclusion_target_unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||p_user_id::text||':'||private.training_headword_group_v1(actual_entry)::text));
 PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:'||p_user_id::text||':'||actual_entry::text));

 PERFORM pg_advisory_xact_lock(hashtext('training-pair:'||p_user_id::text||':'||pair_key));
 SELECT * INTO conversion FROM private.ordinary_pair_known_conversions WHERE exclusion_id=p_exclusion_id FOR UPDATE;
 IF conversion.undone_at IS NOT NULL THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
 IF conversion.target_id IS NULL THEN
 FOR mark IN SELECT * FROM public.user_card_known_marks WHERE id=ANY(conversion.introduced_mark_ids) ORDER BY card_type_id LOOP
  IF mark.cleared_at IS NOT NULL THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
  IF NOT private.known_mark_has_other_conversion_v1(mark.id,p_exclusion_id) THEN
   undo_id:=gen_random_uuid();
   PERFORM private.perform_platform_v2_card_action_non_session_latch_v1(p_user_id,'undo-known',p_entry_id,mark.card_type_id,
    COALESCE((SELECT state_revision::text FROM public.user_card_status WHERE user_id=p_user_id AND entry_id=p_entry_id AND card_type_id=mark.card_type_id),'untracked'),mark.id,mark.revision::text,NULL,undo_id,NULL,'first_party',NULL);
   undo_ids:=array_append(undo_ids,(SELECT undo_event_id FROM public.user_card_known_marks WHERE id=mark.id));
  END IF;
 END LOOP;
 ELSE
  FOR exercise_mark IN SELECT * FROM private.training_exercise_known_marks WHERE id=ANY(conversion.introduced_mark_ids) ORDER BY id LOOP
   IF exercise_mark.cleared_at IS NOT NULL THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
   IF NOT private.known_mark_has_other_conversion_v1(exercise_mark.id,p_exclusion_id) THEN
    PERFORM private.set_training_exercise_known_v1(p_user_id,exercise_mark.target_id,false,exercise_mark.id);
    undo_ids:=array_append(undo_ids,(SELECT undo_event_id FROM private.training_exercise_known_marks WHERE id=exercise_mark.id));
   END IF;
  END LOOP;
 END IF;
 UPDATE private.ordinary_pair_known_conversions SET undone_at=private.training_reference_now_v1(),undo_event_ids=undo_ids WHERE exclusion_id=p_exclusion_id;
 response:=jsonb_build_object('status','accepted','actionId',p_action,'clientEventId',p_client_event_id,'exclusionId',p_exclusion_id,'pairKey',pair_key,'family',family,'excluded',false,'consumption',NULL);
 INSERT INTO private.training_pair_exclusion_events(user_id,client_event_id,action,exclusion_id,request_hash,response,created_at) VALUES(p_user_id,p_client_event_id,p_action,p_exclusion_id,hash,response,private.training_reference_now_v1());
 UPDATE public.training_sessions s SET external_state_revision=external_state_revision+1 FROM public.training_active_runs a WHERE a.user_id=p_user_id AND a.session_id=s.id AND s.completed_at IS NULL;
 RETURN response;
END; $$;
REVOKE ALL ON FUNCTION public.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.convert_meaning_exclusions_to_known_as_principal_v1(p_limit integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE exclusion record; converted integer:=0;
BEGIN
 IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role') IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_conversion_limit'; END IF;
 FOR exclusion IN SELECT * FROM (
  SELECT 'headword'::text store,id,user_id,created_at FROM private.training_headword_exclusions WHERE restored_at IS NULL
  UNION ALL
  SELECT 'pair',id,user_id,created_at FROM private.training_pair_exclusions WHERE restored_at IS NULL
 ) pending ORDER BY created_at,id,store LIMIT p_limit LOOP
  PERFORM pg_advisory_xact_lock(hashtext('training-active-run:'||exclusion.user_id::text));
  IF exclusion.store='headword' THEN PERFORM private.convert_meaning_exclusion_to_known_v1(exclusion.id);
  ELSE PERFORM private.convert_ordinary_pair_to_known_v1(exclusion.id); END IF;
  UPDATE public.training_sessions s SET external_state_revision=external_state_revision+1 FROM public.training_active_runs a WHERE a.user_id=exclusion.user_id AND a.session_id=s.id AND s.completed_at IS NULL;
  converted:=converted+1;
 END LOOP;
 RETURN converted;
END; $$;
REVOKE ALL ON FUNCTION public.convert_meaning_exclusions_to_known_as_principal_v1(integer) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the latest committed candidate/grade bodies and insert exact target
-- availability checks before LIMIT or scheduling mutation, never after selection.
DO $known_owners$
DECLARE signature text; definition text; anchor text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'private.platform_v2_idiom_exercise_candidates_v1(uuid,text,integer,integer)',
  'private.platform_v2_idiom_exercise_candidates_v2(uuid,text,integer,integer,uuid,text,text,jsonb)',
  'private.platform_v2_translation_exercise_candidates_v1(uuid,integer,integer)',
  'private.platform_v2_translation_exercise_candidates_v2(uuid,integer,integer,uuid,text,text,jsonb)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);anchor:='WHERE COALESCE(hidden, false) = false';
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'exercise Known candidate baseline changed: %',signature; END IF;
  EXECUTE replace(definition,anchor,anchor||E'\n AND NOT private.training_exercise_is_known_v1(p_user_id,shaped.target_id)');
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'private.perform_platform_v2_idiom_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)',
  'private.perform_platform_v2_translation_exercise_action_v1(uuid,uuid,text,text,uuid,uuid,jsonb)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  anchor:=CASE WHEN strpos(signature,'idiom')>0 THEN E'SELECT *\n      INTO v_state\n      FROM public.user_training_exercise_state AS state' ELSE E'SELECT * INTO v_state\n      FROM public.user_training_exercise_state AS state' END;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'exercise Known action baseline changed: %',signature; END IF;
  EXECUTE replace(definition,anchor,E'IF private.training_exercise_is_known_v1(p_user_id,p_target_id) THEN RAISE EXCEPTION ''exercise_is_known''; END IF;\n    '||anchor);
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['public.read_training_idiom_stats_v1(uuid)','public.read_training_translation_stats_v1(uuid)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);anchor:='AND NOT excluded';
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'exercise Known stats baseline changed: %',signature; END IF;
  EXECUTE replace(definition,anchor,anchor||' AND NOT private.training_exercise_is_known_v1(v_user_id,scoped.target_id)');
 END LOOP;
 definition:=pg_get_functiondef('private.training_local_daily_stats_v1(uuid,text[],uuid,text,text)'::regprocedure);anchor:='AND s.fsrs_enabled = true';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ordinary Known stats baseline changed'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n AND NOT EXISTS(SELECT 1 FROM public.user_card_known_marks k WHERE k.user_id=s.user_id AND k.entry_id=s.entry_id AND k.card_type_id=s.card_type_id AND k.cleared_at IS NULL)');
END; $known_owners$;

CREATE FUNCTION public.get_training_exercise_known_state_v1(p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); target private.platform_v2_training_exercise_targets%rowtype; mark private.training_exercise_known_marks%rowtype;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM private.platform_v2_training_exercise_targets WHERE id=p_target AND family IN ('idiom','translation');
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM private.active_word_entries entry WHERE entry.id=target.entry_id AND private.entry_access_v1(principal,entry.id,'train')) THEN RAISE EXCEPTION 'training_exercise_target_unavailable'; END IF;
 SELECT * INTO mark FROM private.training_exercise_known_marks WHERE user_id=principal AND target_id=p_target AND cleared_at IS NULL;
 RETURN jsonb_build_object('targetId',target.id,'entryId',target.entry_id,'family',target.family,'direction',target.direction,
  'sourceTextFingerprint',target.source_text_fingerprint,'knownMarkId',mark.id,'knownMarkRevision',mark.revision,'knownMarkedAt',mark.marked_at);
END; $$;
REVOKE ALL ON FUNCTION public.get_training_exercise_known_state_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_training_exercise_known_state_v1(uuid) TO authenticated,service_role;

-- Persistent Library recovery, independent of transient undo notifications.
CREATE FUNCTION public.get_training_exercise_known_choices_v1(p_entry_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE principal uuid:=auth.uid(); choices jsonb;
BEGIN
 IF principal IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.active_word_entries e WHERE e.id=p_entry_id AND private.entry_access_v1(principal,e.id,'train')) THEN RAISE EXCEPTION 'training_exercise_target_unavailable'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('exclusionId',c.exclusion_id,'targetId',c.target_id,'family',x.family,
  'text',CASE WHEN n.binding_state='active' AND n.source_text_fingerprint=x.source_text_fingerprint THEN NULLIF(btrim(n.canonical_source_text),'') END,
  'directions',(SELECT jsonb_agg(t.direction ORDER BY t.direction) FROM private.training_exercise_known_marks k JOIN private.platform_v2_training_exercise_targets t ON t.id=k.target_id WHERE k.id=ANY(c.introduced_mark_ids) AND k.cleared_at IS NULL)) ORDER BY c.converted_at,c.exclusion_id),'[]'::jsonb)
 INTO choices FROM private.ordinary_pair_known_conversions c JOIN private.training_pair_exclusions x ON x.id=c.exclusion_id AND x.user_id=c.user_id
 LEFT JOIN private.platform_v2_content_nodes n ON n.id=x.content_node_id AND n.entry_id=x.entry_id
 WHERE c.user_id=principal AND c.entry_id=p_entry_id AND c.target_id IS NOT NULL AND c.undone_at IS NULL
  AND EXISTS(SELECT 1 FROM private.training_exercise_known_marks k WHERE k.id=ANY(c.introduced_mark_ids) AND k.cleared_at IS NULL);
 RETURN choices;
END; $$;
REVOKE ALL ON FUNCTION public.get_training_exercise_known_choices_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_training_exercise_known_choices_v1(uuid) TO authenticated,service_role;

COMMIT;
