-- Exclusion is an availability decision, not Known or an FSRS grade.
-- No scheduling rows are created, updated, or deleted by these actions.
BEGIN;

CREATE OR REPLACE FUNCTION private.training_pair_key_v1(
  p_family text, p_entry_id uuid, p_node_id uuid,
  p_fingerprint text, p_card_type_id text
)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT CASE
    WHEN p_family = 'meaning' THEN
      'entry:' || p_entry_id::text || ':' || CASE
        WHEN p_card_type_id IN ('word-to-definition','definition-to-word') THEN 'recall'
        ELSE p_card_type_id END
    WHEN p_family IN ('idiom','translation') THEN
      'node:' || p_family || ':' || p_entry_id::text || ':' || p_node_id::text || ':' || p_fingerprint
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION private.training_pair_key_v1(text,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.training_pair_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair_key text NOT NULL,
  family text NOT NULL CHECK (family IN ('meaning','idiom','translation')),
  entry_id uuid NOT NULL REFERENCES public.word_entries(id) ON DELETE RESTRICT,
  content_node_id uuid REFERENCES private.platform_v2_content_nodes(id) ON DELETE RESTRICT,
  source_text_fingerprint text,
  created_at timestamptz NOT NULL,
  restored_at timestamptz,
  CHECK ((family = 'meaning' AND content_node_id IS NULL AND source_text_fingerprint IS NULL)
    OR (family IN ('idiom','translation') AND content_node_id IS NOT NULL AND source_text_fingerprint IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS training_pair_exclusions_active_idx
  ON private.training_pair_exclusions(user_id,pair_key) WHERE restored_at IS NULL;
ALTER TABLE private.training_pair_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.training_pair_exclusions FROM PUBLIC, anon, authenticated, service_role;

-- Immutable action result is also the retry receipt. Undo changes the mark,
-- never this accepted event or its response.
CREATE TABLE IF NOT EXISTS private.training_pair_exclusion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('exclude-pair','restore-pair')),
  exclusion_id uuid NOT NULL REFERENCES private.training_pair_exclusions(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(user_id,client_event_id)
);
ALTER TABLE private.training_pair_exclusion_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.training_pair_exclusion_events FROM PUBLIC, anon, authenticated, service_role;

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
        p_family,p_entry_id,p_node_id,p_fingerprint,p_card_type_id));
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
  PERFORM pg_advisory_xact_lock(hashtext('training-pair:'||p_user_id::text||':'||v_pair_key));
  IF private.training_pair_excluded_v1(p_user_id,p_family,p_entry_id,p_node_id,p_fingerprint,p_card_type_id) THEN
    RAISE EXCEPTION 'training_pair_excluded';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.require_training_pair_available_v1(uuid,text,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perform_training_pair_exclusion_as_principal_v1(
  p_user_id uuid, p_action text, p_client_event_id uuid,
  p_entry_id uuid, p_card_type_id text, p_exercise_target_id uuid,
  p_exclusion_id uuid, p_session_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
  v_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),
    (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb)->>'role');
  v_hash text;
  v_event private.training_pair_exclusion_events%rowtype;
  v_target private.platform_v2_training_exercise_targets%rowtype;
  v_family text := 'meaning';
  v_entry_id uuid := p_entry_id;
  v_node_id uuid;
  v_fingerprint text;
  v_pair_key text;
  v_mark_id uuid;
  v_consumption jsonb;
  v_response jsonb;
  v_now timestamptz := private.training_reference_now_v1();
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('exclude-pair','restore-pair')
    OR p_client_event_id IS NULL THEN RAISE EXCEPTION 'invalid_exclusion_action'; END IF;
  IF (p_action = 'restore-pair') IS DISTINCT FROM (p_exclusion_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_exclusion_mark';
  END IF;
  -- A restore is not a new session action; a training exclusion must consume
  -- the current member. Library exclusion passes no session through its own route.
  IF p_action = 'restore-pair' AND p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_training_session_id';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
  v_hash := encode(digest(jsonb_build_object('action',p_action,'entryId',p_entry_id,
    'cardTypeId',p_card_type_id,'exerciseTargetId',p_exercise_target_id,
    'exclusionId',p_exclusion_id,'sessionId',p_session_id)::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtext('training-pair-event:'||p_user_id::text||':'||p_client_event_id::text));
  SELECT * INTO v_event FROM private.training_pair_exclusion_events
    WHERE user_id=p_user_id AND client_event_id=p_client_event_id;
  IF FOUND THEN
    IF v_event.request_hash IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'exclusion_idempotency_conflict'; END IF;
    RETURN v_event.response || jsonb_build_object('status','duplicate');
  END IF;
  -- Lock ordering matches existing reviews: active run, then content pair.
  IF p_session_id IS NOT NULL THEN
    PERFORM private.require_active_training_session_v1(p_user_id,p_session_id);
  END IF;
  IF p_exercise_target_id IS NULL THEN
    IF p_entry_id IS NULL OR p_card_type_id IS NULL OR p_card_type_id NOT IN (
      'word-to-definition','definition-to-word','listen-recognize','listen-type'
    ) THEN RAISE EXCEPTION 'invalid_exclusion_target'; END IF;
  ELSE
    IF p_entry_id IS NOT NULL OR p_card_type_id IS NOT NULL THEN
      RAISE EXCEPTION 'ambiguous_exclusion_target';
    END IF;
    SELECT * INTO v_target FROM private.platform_v2_training_exercise_targets
      WHERE id=p_exercise_target_id AND family IN ('idiom','translation') AND visibility_state='active';
    IF NOT FOUND THEN RAISE EXCEPTION 'training_exercise_target_unavailable'; END IF;
    v_family := v_target.family; v_entry_id := v_target.entry_id;
    v_node_id := v_target.content_node_id; v_fingerprint := v_target.source_text_fingerprint;
    IF NOT EXISTS (SELECT 1 FROM private.platform_v2_content_nodes node
      WHERE node.id=v_node_id AND node.entry_id=v_entry_id AND node.binding_state='active'
        AND node.source_text_fingerprint=v_fingerprint
        AND node.kind=CASE WHEN v_family='idiom' THEN 'idiom' ELSE 'example' END)
      OR NOT private.platform_v2_training_ordinary_meaning_eligible_v1(p_user_id,v_entry_id) THEN
      RAISE EXCEPTION 'training_exercise_target_unavailable';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.word_entries entry WHERE entry.id=v_entry_id
    AND (entry.dictionary_id IS NULL OR public.can_access_dictionary(p_user_id,entry.dictionary_id,'read'))) THEN
    RAISE EXCEPTION 'exclusion_target_unavailable';
  END IF;
  v_pair_key := private.training_pair_key_v1(v_family,v_entry_id,v_node_id,v_fingerprint,p_card_type_id);
  PERFORM pg_advisory_xact_lock(hashtext('training-pair:'||p_user_id::text||':'||v_pair_key));
  IF p_action='exclude-pair' THEN
    IF EXISTS (SELECT 1 FROM private.training_pair_exclusions
      WHERE user_id=p_user_id AND pair_key=v_pair_key AND restored_at IS NULL) THEN
      RAISE EXCEPTION 'training_pair_already_excluded';
    END IF;
    IF p_session_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.training_sessions WHERE id=p_session_id
        AND user_id=p_user_id AND exercise_family=v_family) THEN
        RAISE EXCEPTION 'training_exercise_session_family_mismatch';
      END IF;
      IF v_family='meaning' THEN
        v_consumption := private.consume_training_session_member(p_user_id,p_session_id,v_entry_id,p_card_type_id);
        IF COALESCE(v_consumption->>'status','') NOT IN ('consumed','consumed-complete') THEN
          RAISE EXCEPTION 'training_session_member_unavailable';
        END IF;
      ELSE
        v_consumption := private.consume_platform_v2_training_exercise_session_member_v1(p_user_id,p_session_id,p_exercise_target_id);
      END IF;
    END IF;
    INSERT INTO private.training_pair_exclusions(user_id,pair_key,family,entry_id,content_node_id,source_text_fingerprint,created_at)
      VALUES(p_user_id,v_pair_key,v_family,v_entry_id,v_node_id,v_fingerprint,v_now) RETURNING id INTO v_mark_id;
  ELSE
    UPDATE private.training_pair_exclusions SET restored_at=v_now
      WHERE id=p_exclusion_id AND user_id=p_user_id AND pair_key=v_pair_key AND restored_at IS NULL
      RETURNING id INTO v_mark_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'stale_exclusion_mark'; END IF;
  END IF;
  v_response := jsonb_build_object('status','accepted','actionId',p_action,
    'clientEventId',p_client_event_id,'exclusionId',v_mark_id,'pairKey',v_pair_key,
    'family',v_family,'excluded',p_action='exclude-pair','consumption',v_consumption);
  INSERT INTO private.training_pair_exclusion_events(user_id,client_event_id,action,exclusion_id,request_hash,response,created_at)
    VALUES(p_user_id,p_client_event_id,p_action,v_mark_id,v_hash,v_response,v_now);
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perform_training_pair_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid,uuid)
  TO service_role;
COMMIT;
