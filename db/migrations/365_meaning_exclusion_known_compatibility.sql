BEGIN;
-- Original exclusions and their immutable receipts remain available to History.
-- The mapping identifies only Known marks introduced by each conversion.
CREATE TABLE private.meaning_exclusion_known_conversions (
 exclusion_id uuid PRIMARY KEY REFERENCES private.training_headword_exclusions(id),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 entry_id uuid NOT NULL REFERENCES public.word_entries(id),
 introduced_mark_ids uuid[] NOT NULL,
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
DECLARE response jsonb; conversion private.meaning_exclusion_known_conversions%rowtype; mark public.user_card_known_marks%rowtype; hash text; event private.training_headword_exclusion_events%rowtype;
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
  PERFORM private.perform_platform_v2_card_action_non_session_latch_v1(p_user_id,'undo-known',p_entry_id,mark.card_type_id,
   COALESCE((SELECT state_revision::text FROM public.user_card_status WHERE user_id=p_user_id AND entry_id=p_entry_id AND card_type_id=mark.card_type_id),'untracked'),
   mark.id,mark.revision::text,NULL,gen_random_uuid(),NULL,'first_party',NULL);
 END LOOP;
 UPDATE private.meaning_exclusion_known_conversions SET undone_at=private.training_reference_now_v1() WHERE exclusion_id=p_exclusion_id;
 response:=jsonb_build_object('status','accepted','actionId',p_action,'clientEventId',p_client_event_id,'exclusionId',p_exclusion_id,'headwordGroupId',private.training_headword_group_v1(p_entry_id),'family','meaning','excluded',false);
 INSERT INTO private.training_headword_exclusion_events(user_id,client_event_id,action,exclusion_id,request_hash,response,created_at) VALUES(p_user_id,p_client_event_id,p_action,p_exclusion_id,hash,response,private.training_reference_now_v1());
 UPDATE public.training_sessions s SET external_state_revision=external_state_revision+1 FROM public.training_active_runs a WHERE a.user_id=p_user_id AND a.session_id=s.id AND s.completed_at IS NULL;
 RETURN response;
END; $$;
REVOKE ALL ON FUNCTION public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.perform_training_headword_exclusion_as_principal_v1(uuid,text,uuid,uuid,text,uuid,uuid) TO service_role;
COMMIT;
