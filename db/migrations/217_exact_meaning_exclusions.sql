-- Historical storage/wire names remain compatibility aliases; active scope is
-- the initiating entry, not all sibling meanings. Preserve immutable receipts.
BEGIN;
DROP INDEX private.training_headword_exclusions_active_idx;
CREATE UNIQUE INDEX training_headword_exclusions_active_idx ON private.training_headword_exclusions(user_id,entry_id) WHERE restored_at IS NULL;
COMMENT ON TABLE private.training_headword_exclusions IS 'Meaning-wide ordinary-direction exclusions keyed by originating entry. Historical name retained for wire/storage compatibility.';
CREATE OR REPLACE FUNCTION private.training_pair_excluded_v1(
  p_user_id uuid, p_family text, p_entry_id uuid,
  p_node_id uuid, p_fingerprint text, p_card_type_id text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM private.training_pair_exclusions
    WHERE user_id = p_user_id AND restored_at IS NULL
      AND pair_key = private.training_pair_key_v1(
        p_family,p_entry_id,p_node_id,p_fingerprint,p_card_type_id))
    OR (p_family='meaning' AND p_card_type_id IN ('word-to-definition','definition-to-word')
      AND EXISTS (SELECT 1 FROM private.training_headword_exclusions
        WHERE user_id=p_user_id AND restored_at IS NULL
          AND entry_id=p_entry_id));
$$;
REVOKE ALL ON FUNCTION private.training_pair_excluded_v1(uuid,text,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Reviews call this after replay lookup and before state mutation. Sharing
-- the pair lock makes exclude-versus-review deterministic without touching FSRS.
CREATE OR REPLACE FUNCTION private.require_training_pair_available_v1(
  p_user_id uuid, p_family text, p_entry_id uuid,
  p_node_id uuid, p_fingerprint text, p_card_type_id text
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_pair_key text := private.training_pair_key_v1(p_family,p_entry_id,p_node_id,p_fingerprint,p_card_type_id);
BEGIN
  IF p_user_id IS NULL OR v_pair_key IS NULL THEN RAISE EXCEPTION 'invalid_exclusion_target'; END IF;
  IF p_family='meaning' AND p_card_type_id IN ('word-to-definition','definition-to-word') THEN
    PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||p_user_id::text||':'||
      private.training_headword_group_v1(p_entry_id)::text));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('training-pair:'||p_user_id::text||':'||v_pair_key));
  IF private.training_pair_excluded_v1(p_user_id,p_family,p_entry_id,p_node_id,p_fingerprint,p_card_type_id) THEN
    RAISE EXCEPTION 'training_pair_excluded';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.require_training_pair_available_v1(uuid,text,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perform_training_headword_exclusion_as_principal_v1(
  p_user_id uuid, p_action text, p_client_event_id uuid,
  p_entry_id uuid, p_card_type_id text,
  p_exclusion_id uuid, p_session_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),
    (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role');
  v_hash text;
  v_event private.training_headword_exclusion_events%rowtype;
  v_group_id uuid;
  v_mark_id uuid;
  v_consumption jsonb;
  v_response jsonb;
  v_now timestamptz := private.training_reference_now_v1();
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('exclude-headword','restore-headword')
    OR p_client_event_id IS NULL THEN RAISE EXCEPTION 'invalid_exclusion_action'; END IF;
  IF (p_action = 'restore-headword') IS DISTINCT FROM (p_exclusion_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_exclusion_mark';
  END IF;
  -- A restore is not a new session action; a training exclusion must consume
  -- the current member. Library exclusion passes no session through its own route.
  IF p_action = 'restore-headword' AND p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_training_session_id';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
  v_hash := encode(digest(jsonb_build_object('action',p_action,'entryId',p_entry_id,
    'cardTypeId',p_card_type_id,
    'exclusionId',p_exclusion_id,'sessionId',p_session_id)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtext('training-headword-event:'||p_user_id::text||':'||p_client_event_id::text));
  SELECT * INTO v_event FROM private.training_headword_exclusion_events
    WHERE user_id=p_user_id AND client_event_id=p_client_event_id;
  IF FOUND THEN
    IF v_event.request_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'exclusion_idempotency_conflict'; END IF;
    RETURN v_event.response || jsonb_build_object('status','duplicate');
  END IF;
  -- Lock ordering matches reviews: active run, then headword, then pair.
  IF p_session_id IS NOT NULL THEN
    PERFORM private.require_active_training_session_v1(p_user_id,p_session_id);
  END IF;
  IF p_entry_id IS NULL OR
    (p_session_id IS NOT NULL AND (p_card_type_id IS NULL OR p_card_type_id NOT IN ('word-to-definition','definition-to-word')))
    OR (p_session_id IS NULL AND p_card_type_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_exclusion_target';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.word_entries entry WHERE entry.id=p_entry_id
    AND (entry.dictionary_id IS NULL OR public.can_access_dictionary(p_user_id,entry.dictionary_id,'read'))) THEN
    RAISE EXCEPTION 'exclusion_target_unavailable';
  END IF;
  v_group_id := private.training_headword_group_v1(p_entry_id);
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'exclusion_target_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('training-headword:'||p_user_id::text||':'||v_group_id::text));
  IF p_action='exclude-headword' THEN
    IF EXISTS (SELECT 1 FROM private.training_headword_exclusions
      WHERE user_id=p_user_id AND entry_id=p_entry_id AND restored_at IS NULL) THEN
      RAISE EXCEPTION 'training_pair_already_excluded';
    END IF;
    IF p_session_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.training_sessions WHERE id=p_session_id
        AND user_id=p_user_id AND exercise_family='meaning') THEN
        RAISE EXCEPTION 'training_exercise_session_family_mismatch';
      END IF;
      v_consumption := private.consume_training_session_member(p_user_id,p_session_id,p_entry_id,p_card_type_id);
      IF COALESCE(v_consumption->>'status','') NOT IN ('consumed','consumed-complete') THEN
        RAISE EXCEPTION 'training_session_member_unavailable';
      END IF;
    END IF;
    INSERT INTO private.training_headword_exclusions(user_id,headword_group_id,entry_id,created_at)
      VALUES(p_user_id,v_group_id,p_entry_id,v_now) RETURNING id INTO v_mark_id;
  ELSE
    UPDATE private.training_headword_exclusions SET restored_at=v_now
      WHERE id=p_exclusion_id AND user_id=p_user_id AND entry_id=p_entry_id AND restored_at IS NULL
      RETURNING id INTO v_mark_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
  END IF;
  v_response := jsonb_build_object('status','accepted','actionId',p_action,
    'clientEventId',p_client_event_id,'exclusionId',v_mark_id,'headwordGroupId',v_group_id,
    'family','meaning','excluded',p_action='exclude-headword','consumption',v_consumption);
  INSERT INTO private.training_headword_exclusion_events(user_id,client_event_id,action,exclusion_id,request_hash,response,created_at)
    VALUES(p_user_id,p_client_event_id,p_action,v_mark_id,v_hash,v_response,v_now);
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid)
  TO service_role;

-- Preserve the latest scheduler/review bodies and fail on an unexpected baseline.

-- Preserve layered current function bodies, replacing only exact scope predicates.
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.prokind='f'
 AND p.prosrc LIKE '%training_headword_exclusions%' LOOP
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'exclusion.headword_group_id=private.training_headword_group_v1(scope.id)','exclusion.entry_id=scope.id');
  definition:=replace(definition,'exclusion.headword_group_id=private.training_headword_group_v1(s.entry_id)','exclusion.entry_id=s.entry_id');
  EXECUTE definition;
 END LOOP;
END;$$;
COMMIT;
