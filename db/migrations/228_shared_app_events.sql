-- #731: portable Supabase Broadcast hints. Authoritative reads/writes remain unchanged.
BEGIN;

CREATE FUNCTION private.can_receive_app_event_v1(p_topic text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE principal uuid := auth.uid(); entry uuid;
BEGIN
  IF principal IS NULL THEN RETURN false; END IF;
  IF p_topic = 'app:releases' OR p_topic = 'app:user:' || principal::text THEN RETURN true; END IF;
  IF p_topic !~ '^app:translation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$' THEN RETURN false; END IF;
  entry := split_part(p_topic, ':', 3)::uuid;
  RETURN EXISTS (SELECT 1 FROM public.word_entries w WHERE w.id = entry
    AND public.can_access_dictionary(principal, w.dictionary_id, 'read'));
END $$;
REVOKE ALL ON FUNCTION private.can_receive_app_event_v1(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_receive_app_event_v1(text) TO authenticated;

-- Supabase owns this schema: policy DDL only, never ALTER its objects.
CREATE POLICY app_events_receive_v1 ON realtime.messages FOR SELECT TO authenticated
USING (extension = 'broadcast' AND topic = (select realtime.topic())
  AND private.can_receive_app_event_v1(topic));
-- Existing permissive policies must never allow clients to forge our events or
-- read another learner's app topics. Restrictive guards affect app:* only.
CREATE POLICY app_events_guard_read_v1 ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
USING ((topic NOT LIKE 'app:%' AND COALESCE((select realtime.topic()), '') NOT LIKE 'app:%')
  OR (extension = 'broadcast' AND topic = (select realtime.topic()) AND private.can_receive_app_event_v1(topic)));
CREATE POLICY app_events_guard_write_v1 ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (topic NOT LIKE 'app:%' AND COALESCE((select realtime.topic()), '') NOT LIKE 'app:%');
CREATE POLICY app_events_guard_anon_read_v1 ON realtime.messages AS RESTRICTIVE FOR SELECT TO anon
USING (topic NOT LIKE 'app:%' AND COALESCE((select realtime.topic()), '') NOT LIKE 'app:%');
CREATE POLICY app_events_guard_anon_write_v1 ON realtime.messages AS RESTRICTIVE FOR INSERT TO anon
WITH CHECK (topic NOT LIKE 'app:%' AND COALESCE((select realtime.topic()), '') NOT LIKE 'app:%');

CREATE FUNCTION private.send_app_event_v1(p_topic text, p_kind text, p_resource text DEFAULT NULL,
  p_language text DEFAULT NULL, p_revision text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE dedupe text := 'app_event.sent_' || md5(p_topic || ':' || p_kind);
BEGIN
  -- Domain-wide user hints are coalesced per transaction. No durable delivery
  -- promise: reconnect reads and degraded polling recover missed messages.
  IF current_setting(dedupe, true) = txid_current()::text THEN RETURN; END IF;
  PERFORM set_config(dedupe, txid_current()::text, true);
  PERFORM realtime.send(jsonb_strip_nulls(jsonb_build_object(
    'version', 1, 'eventId', gen_random_uuid(), 'kind', p_kind,
    'resourceId', p_resource, 'language', p_language,
    'revision', p_revision, 'occurredAt', clock_timestamp())), 'app-event', p_topic, true);
EXCEPTION WHEN OTHERS THEN
  -- Realtime availability must never turn an accepted learning action into a failure.
  RAISE WARNING 'app_event_delivery_failed: %', SQLSTATE;
END $$;
REVOKE ALL ON FUNCTION private.send_app_event_v1(text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.broadcast_app_row_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb; prior jsonb; principal uuid; resource text; kind text := TG_ARGV[0]; language text;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' THEN
    prior := to_jsonb(OLD);
    IF r = prior THEN RETURN NEW; END IF;
  END IF;
  IF kind = 'translation' THEN
    -- Cache publication covers both durable jobs and synchronous fallback.
    IF r->>'status' NOT IN ('ready','failed') THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND r->>'status' = prior->>'status'
      AND r->>'updated_at' = prior->>'updated_at' THEN RETURN NEW; END IF;
    resource := r->>'word_entry_id'; language := r->>'target_lang';
    kind := 'translation.' || (r->>'status');
    PERFORM private.send_app_event_v1('app:translation:' || resource || ':' || language,
      kind, resource, language, r->>'updated_at');
  ELSIF kind = 'translation-job' THEN
    -- Ready already emits through the cache trigger in the same transaction.
    IF r->>'status' <> 'failed' OR (TG_OP = 'UPDATE' AND prior->>'status' = 'failed') THEN RETURN NEW; END IF;
    resource := r->>'word_entry_id'; language := r->>'target_lang';
    PERFORM private.send_app_event_v1('app:translation:' || resource || ':' || language,
      'translation.failed', resource, language, r->>'updated_at');
  ELSE
    principal := (r->>'user_id')::uuid;
    IF TG_TABLE_NAME = 'user_word_list_items' THEN
      SELECT l.user_id INTO principal FROM public.user_word_lists l WHERE l.id = (r->>'list_id')::uuid;
    END IF;
    -- Parent collection DELETE carries the cascade hint when its rows are gone.
    IF principal IS NOT NULL THEN
      PERFORM private.send_app_event_v1('app:user:' || principal::text, kind,
        CASE WHEN kind = 'account.changed' THEN TG_TABLE_NAME ELSE NULL END, NULL, txid_current()::text);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.broadcast_app_row_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER app_events_translation AFTER INSERT OR UPDATE ON public.word_entry_translations
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('translation');
CREATE TRIGGER app_events_translation_job AFTER INSERT OR UPDATE OF status ON public.dictionary_translation_jobs
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('translation-job');
CREATE TRIGGER app_events_training_run AFTER INSERT OR UPDATE OR DELETE ON public.training_active_runs
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('training.changed');
CREATE TRIGGER app_events_training_session AFTER UPDATE OF superseded_at, completed_at, external_state_revision, planned_state_revision ON public.training_sessions
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('training.changed');
CREATE TRIGGER app_events_account AFTER INSERT OR UPDATE OR DELETE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('account.changed');
CREATE TRIGGER app_events_learning AFTER INSERT ON public.user_card_action_events
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('learning.changed');
CREATE TRIGGER app_events_exercise_learning AFTER INSERT ON public.user_training_exercise_action_events
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('learning.changed');
CREATE TRIGGER app_events_pair_exclusion AFTER INSERT ON private.training_pair_exclusion_events
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('learning.changed');
CREATE TRIGGER app_events_meaning_exclusion AFTER INSERT ON private.training_headword_exclusion_events
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('learning.changed');
CREATE TRIGGER app_events_meaning_resume AFTER INSERT ON private.meaning_resume_events
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('learning.changed');
CREATE TRIGGER app_events_collection AFTER INSERT OR UPDATE OR DELETE ON public.user_word_lists
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('collections.changed');
CREATE TRIGGER app_events_collection_items AFTER INSERT OR DELETE ON public.user_word_list_items
FOR EACH ROW EXECUTE FUNCTION private.broadcast_app_row_v1('collections.changed');

CREATE FUNCTION public.publish_app_release_v1(p_commit text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_commit !~ '^[0-9a-f]{40}$' OR p_commit IS NULL THEN RAISE EXCEPTION 'invalid_release_commit'; END IF;
  PERFORM private.send_app_event_v1('app:releases','release.available',p_commit,NULL,p_commit);
END $$;
REVOKE ALL ON FUNCTION public.publish_app_release_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_app_release_v1(text) TO service_role;
COMMIT;
