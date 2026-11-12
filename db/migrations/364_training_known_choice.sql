BEGIN;
-- Choices are staged in the UI. One receipt owns both directional marks and the
-- current member consumption; a lost response can never apply a second intent.
CREATE TABLE private.training_known_choice_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL,
  entry_id uuid NOT NULL REFERENCES public.word_entries(id),
  session_id uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_event_id)
);
ALTER TABLE private.training_known_choice_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.training_known_choice_events FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.set_training_known_directions_as_principal_v1(
  p_user_id uuid, p_entry_id uuid, p_session_id uuid, p_current_direction text,
  p_known_directions text[], p_expected_revision text, p_client_event_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, private, extensions, pg_temp AS $$
DECLARE
  previous private.training_known_choice_events%rowtype;
  request_hash text;
  progress jsonb;
  direction text;
  mark public.user_card_known_marks%rowtype;
  consumption jsonb;
  response jsonb;
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),
    (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role') IS DISTINCT FROM 'service_role'
    OR p_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_entry_id IS NULL OR p_session_id IS NULL OR p_client_event_id IS NULL OR
    p_current_direction IS NULL OR p_current_direction NOT IN ('word-to-definition','definition-to-word') OR
    p_known_directions IS NULL OR cardinality(p_known_directions)>2 OR
    array_position(p_known_directions,NULL) IS NOT NULL OR
    NOT p_known_directions <@ ARRAY['word-to-definition','definition-to-word']::text[] OR
    cardinality(p_known_directions)<>(SELECT count(DISTINCT d) FROM unnest(p_known_directions) d) OR
    p_expected_revision IS NULL OR p_expected_revision !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_training_known_choice' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
  request_hash:=encode(digest(jsonb_build_array(p_entry_id,p_session_id,p_current_direction,
    ARRAY(SELECT d FROM unnest(p_known_directions) d ORDER BY d),p_expected_revision)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtext('training-known-choice:'||p_user_id::text||':'||p_client_event_id::text));
  SELECT * INTO previous FROM private.training_known_choice_events event
    WHERE event.user_id=p_user_id AND event.client_event_id=p_client_event_id;
  IF FOUND THEN
    IF previous.request_hash IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'known_choice_idempotency_conflict'; END IF;
    RETURN previous.response || jsonb_build_object('status','duplicate');
  END IF;
  PERFORM private.require_active_training_session_v1(p_user_id,p_session_id);
  IF NOT EXISTS(SELECT 1 FROM public.training_sessions WHERE id=p_session_id AND user_id=p_user_id AND exercise_family='meaning') THEN
    RAISE EXCEPTION 'training_exercise_session_family_mismatch';
  END IF;
  PERFORM private.lock_shared_learning_source_v1(p_user_id,p_entry_id);
  IF NOT private.entry_access_v1(p_user_id,p_entry_id,'train') AND
    NOT private.current_training_entry_permitted_v1(p_user_id,p_entry_id,p_current_direction) THEN
    RAISE EXCEPTION 'entry_not_accessible' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||p_user_id::text||':'||private.training_headword_group_v1(p_entry_id)::text));
  PERFORM pg_advisory_xact_lock(hashtext('shared-meaning-known:'||p_user_id::text||':'||p_entry_id::text));
  progress:=public.get_meaning_learning_progress_v1(p_entry_id);
  IF progress->>'revision' IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'meaning_progress_conflict'; END IF;
  -- Consume before changing eligibility. Any later failure rolls this back too.
  consumption:=private.consume_training_session_member(p_user_id,p_session_id,p_entry_id,p_current_direction);
  IF consumption->>'status' NOT IN ('consumed','consumed-complete') THEN RAISE EXCEPTION 'training_session_member_unavailable'; END IF;
  IF progress->>'exclusionId' IS NOT NULL THEN
    PERFORM public.perform_training_headword_exclusion_as_principal_v1(p_user_id,'restore-headword',gen_random_uuid(),p_entry_id,NULL,(progress->>'exclusionId')::uuid,NULL);
  END IF;
  -- Remove first, then add: a historical paired undo can clear its sibling.
  FOREACH direction IN ARRAY ARRAY['word-to-definition','definition-to-word'] LOOP
    SELECT * INTO mark FROM public.user_card_known_marks k
      WHERE k.user_id=p_user_id AND k.entry_id=p_entry_id AND k.card_type_id=direction AND k.cleared_at IS NULL;
    IF FOUND AND NOT direction=ANY(p_known_directions) THEN
      PERFORM private.perform_platform_v2_card_action_non_session_latch_v1(p_user_id,'undo-known',p_entry_id,direction,
        COALESCE((SELECT state_revision::text FROM public.user_card_status WHERE user_id=p_user_id AND entry_id=p_entry_id AND card_type_id=direction),'untracked'),
        mark.id,mark.revision::text,NULL,gen_random_uuid(),NULL,'first_party',NULL);
    END IF;
  END LOOP;
  FOREACH direction IN ARRAY p_known_directions LOOP
    IF NOT EXISTS(SELECT 1 FROM public.user_card_known_marks k WHERE k.user_id=p_user_id AND k.entry_id=p_entry_id AND k.card_type_id=direction AND k.cleared_at IS NULL) THEN
      PERFORM private.perform_platform_v2_card_action_non_session_latch_v1(p_user_id,'mark-known',p_entry_id,direction,
        COALESCE((SELECT state_revision::text FROM public.user_card_status WHERE user_id=p_user_id AND entry_id=p_entry_id AND card_type_id=direction),'untracked'),
        NULL,NULL,NULL,gen_random_uuid(),NULL,'first_party',NULL);
    END IF;
  END LOOP;
  UPDATE public.training_sessions SET external_state_revision=external_state_revision+1 WHERE id=p_session_id AND user_id=p_user_id;
  response:=jsonb_build_object('status','accepted','clientEventId',p_client_event_id,'entryId',p_entry_id,
    'trainingSessionId',p_session_id,'consumption',consumption,'progress',public.get_meaning_learning_progress_v1(p_entry_id));
  INSERT INTO private.training_known_choice_events(user_id,client_event_id,entry_id,session_id,request_hash,response)
    VALUES(p_user_id,p_client_event_id,p_entry_id,p_session_id,request_hash,response);
  RETURN response;
END; $$;
REVOKE ALL ON FUNCTION public.set_training_known_directions_as_principal_v1(uuid,uuid,uuid,text,text[],text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_training_known_directions_as_principal_v1(uuid,uuid,uuid,text,text[],text,uuid) TO service_role;
COMMIT;
