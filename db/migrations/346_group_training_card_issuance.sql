BEGIN;
CREATE OR REPLACE FUNCTION public.acknowledge_current_training_card_v1(p_user_id uuid, p_session_id uuid, p_entry_id uuid, p_card_type_id text, p_content_version bigint, p_state_revision text, p_target_id uuid DEFAULT NULL::uuid, p_direction text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  issuance_author uuid; issuance_roots uuid[]; generation bigint;
  source public.word_entries%rowtype;
  session public.training_sessions%rowtype;
  target private.platform_v2_training_exercise_targets%rowtype;
  existing private.training_current_card_permits%rowtype;
  expected_id uuid;
  state_revision text;
  reference_now timestamptz:=private.training_reference_now_v1();
BEGIN
  generation:=private.require_active_training_session_v1(p_user_id,p_session_id);
  SELECT * INTO session FROM public.training_sessions WHERE id=p_session_id AND user_id=p_user_id;
  IF NOT FOUND OR session.completed_at IS NOT NULL OR session.superseded_at IS NOT NULL OR session.expires_at<=reference_now THEN
    RAISE EXCEPTION 'training_session_not_active' USING ERRCODE='42501';
  END IF;
  IF p_card_type_id IS NULL OR NOT p_card_type_id=ANY(session.card_type_ids)
    OR p_content_version IS NULL OR p_content_version<1 OR p_state_revision IS NULL THEN
    RAISE EXCEPTION 'current_training_target_invalid' USING ERRCODE='22023';
  END IF;
  -- Same lock order as actions: user/run authority, then exact entry/archive.
  SELECT * INTO source FROM public.word_entries WHERE id=p_entry_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_training_entry_unavailable' USING ERRCODE='42501';
  END IF;
  IF source.content_version<>p_content_version THEN RAISE EXCEPTION 'current_training_content_changed' USING ERRCODE='40001'; END IF;
  SELECT * INTO existing FROM private.training_current_card_permits WHERE user_id=p_user_id;
  IF FOUND AND existing.session_id=p_session_id AND existing.entry_id=p_entry_id AND existing.card_type_id=p_card_type_id
    AND existing.target_id IS NOT DISTINCT FROM p_target_id AND existing.direction IS NOT DISTINCT FROM p_direction
    AND existing.content_version=p_content_version AND existing.state_revision=p_state_revision
    AND private.current_training_permit_valid_v1(existing) THEN
    RETURN jsonb_build_object('permitId',existing.permit_id,'expiresAt',existing.expires_at,'runGeneration',existing.run_generation,
      'entryId',existing.entry_id,'cardTypeId',existing.card_type_id,'targetId',existing.target_id,'contentVersion',existing.content_version);
  END IF;
  SELECT dictionary.owner_user_id INTO issuance_author FROM public.dictionaries dictionary
    WHERE dictionary.id=source.dictionary_id AND dictionary.kind='user'
      AND dictionary.owner_user_id IS DISTINCT FROM p_user_id AND source.management_kind='user';
  IF issuance_author IS NOT NULL THEN
    PERFORM private.lock_sharing_author_scope_v1(issuance_author,false);
    -- Revoke and membership changes lock roots too. Recheck entry authority in
    -- a subsequent statement after waiting, not in the lock statement snapshot.
    SELECT COALESCE(array_agg(DISTINCT path.root_id ORDER BY path.root_id),ARRAY[]::uuid[])
    INTO issuance_roots FROM private.collection_access_paths_for_user_v1(p_user_id) path
    JOIN public.user_word_list_items item ON item.list_id=path.collection_id
    WHERE path.owner_user_id=issuance_author AND item.word_id=p_entry_id;
    -- Both path types are frozen under the author admission above. Keep root
    -- row locks for compatibility with existing direct sharing writers.
    PERFORM root.id FROM private.collection_sharing_roots root
     WHERE root.id=ANY(issuance_roots) ORDER BY root.id FOR SHARE;
    PERFORM root.id FROM private.label_sharing_roots root
     WHERE root.id=ANY(issuance_roots) ORDER BY root.id FOR SHARE;
  END IF;
  IF (issuance_author IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM private.shared_author_entry_memberships_v1 shared
      WHERE shared.user_id=p_user_id AND shared.entry_id=p_entry_id AND shared.root_id=ANY(issuance_roots)))
    OR NOT private.entry_access_v1(p_user_id,p_entry_id,'train') THEN
    RAISE EXCEPTION 'current_training_entry_unavailable' USING ERRCODE='42501';
  END IF;
  IF source.archived_at IS NOT NULL THEN RAISE EXCEPTION 'current_training_entry_unavailable' USING ERRCODE='42501'; END IF;
  IF p_target_id IS NULL THEN
    IF p_direction IS NOT NULL THEN RAISE EXCEPTION 'current_training_target_invalid' USING ERRCODE='22023'; END IF;
    SELECT member.entry_id INTO expected_id FROM public.training_session_members member
      WHERE member.session_id=p_session_id AND member.card_type_id=p_card_type_id
        AND member.consumed_at IS NULL AND member.unavailable_at IS NULL
      ORDER BY member.ordinal LIMIT 1;
    IF expected_id IS DISTINCT FROM p_entry_id THEN RAISE EXCEPTION 'current_training_target_not_next' USING ERRCODE='42501'; END IF;
    SELECT COALESCE((SELECT state.state_revision::text FROM public.user_card_status state
      WHERE state.user_id=p_user_id AND state.entry_id=p_entry_id AND state.card_type_id=p_card_type_id),'untracked') INTO state_revision;
  ELSE
    SELECT * INTO target FROM private.platform_v2_training_exercise_targets WHERE id=p_target_id;
    IF NOT FOUND OR target.entry_id<>p_entry_id OR target.family NOT IN('idiom','translation')
      OR target.direction IS DISTINCT FROM p_direction OR target.visibility_state<>'active'
      OR p_card_type_id<>target.family||':'||target.direction THEN
      RAISE EXCEPTION 'current_training_target_invalid' USING ERRCODE='42501';
    END IF;
    IF target.content_node_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM private.platform_v2_content_nodes node
      WHERE node.id=target.content_node_id AND node.entry_id=p_entry_id AND node.binding_state='active'
        AND node.source_text_fingerprint=target.source_text_fingerprint) THEN
      RAISE EXCEPTION 'current_training_content_changed' USING ERRCODE='40001';
    END IF;
    SELECT member.target_id INTO expected_id FROM public.training_session_exercise_members member
      WHERE member.session_id=p_session_id AND member.consumed_at IS NULL AND member.unavailable_at IS NULL
      ORDER BY member.ordinal LIMIT 1;
    IF expected_id IS DISTINCT FROM p_target_id THEN RAISE EXCEPTION 'current_training_target_not_next' USING ERRCODE='42501'; END IF;
    SELECT COALESCE((SELECT state.state_revision::text FROM public.user_training_exercise_state state
      WHERE state.user_id=p_user_id AND state.target_id=p_target_id),'untracked') INTO state_revision;
  END IF;
  IF state_revision IS DISTINCT FROM p_state_revision THEN RAISE EXCEPTION 'current_training_state_changed' USING ERRCODE='40001'; END IF;
  INSERT INTO private.training_current_card_permits(user_id,session_id,run_generation,entry_id,card_type_id,content_version,
    state_revision,target_id,direction,source_revision,source_text_fingerprint,shared_author_dictionary_id,shared_author_user_id,issued_at,expires_at)
  VALUES(p_user_id,p_session_id,generation,p_entry_id,p_card_type_id,p_content_version,p_state_revision,p_target_id,p_direction,
    target.source_revision,target.source_text_fingerprint,CASE WHEN issuance_author IS NOT NULL THEN source.dictionary_id END,issuance_author,reference_now,LEAST(session.expires_at,reference_now+interval '30 minutes'))
  ON CONFLICT(user_id) DO UPDATE SET permit_id=gen_random_uuid(),session_id=EXCLUDED.session_id,run_generation=EXCLUDED.run_generation,
    entry_id=EXCLUDED.entry_id,card_type_id=EXCLUDED.card_type_id,content_version=EXCLUDED.content_version,
    state_revision=EXCLUDED.state_revision,target_id=EXCLUDED.target_id,direction=EXCLUDED.direction,
    source_revision=EXCLUDED.source_revision,source_text_fingerprint=EXCLUDED.source_text_fingerprint,
    shared_author_dictionary_id=EXCLUDED.shared_author_dictionary_id,shared_author_user_id=EXCLUDED.shared_author_user_id,issued_at=EXCLUDED.issued_at,expires_at=EXCLUDED.expires_at RETURNING * INTO existing;
  RETURN jsonb_build_object('permitId',existing.permit_id,'expiresAt',existing.expires_at,'runGeneration',existing.run_generation,
    'entryId',existing.entry_id,'cardTypeId',existing.card_type_id,'targetId',existing.target_id,'contentVersion',existing.content_version);
END;
$$;
COMMIT;
